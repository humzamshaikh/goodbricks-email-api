

import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SESClient, CreateTemplateCommand, UpdateTemplateCommand, GetTemplateCommand } from '@aws-sdk/client-ses';
import { HttpError } from '../../lib/http.js';
import * as esbuild from 'esbuild';
import { render } from '@react-email/render';
import React from 'react';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-1'
});

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-west-1'
});

const TABLE_NAMES = {
  EMAIL_CAMPAIGNS: process.env.EMAIL_CAMPAIGNS_TABLE_NAME || 'email-campaigns',
  MAIN_TABLE: process.env.MAIN_TABLE_NAME || 'goodbricks-email-main'
} as const;

const BUCKET_NAME = process.env.EMAIL_LAYOUTS_BUCKET_NAME || 'gb-email-layouts-900546257868-us-west-1';

// Function to create a proxy object that intercepts property access
function createTemplateVariableProxy(): any {
  return new Proxy({}, {
    get(target, prop) {
      if (typeof prop === 'string') {
        return `{{${prop}}}`;
      }
      return `{{${String(prop)}}}`;
    }
  });
}

// Function to render JSX to HTML
async function renderJsxToHtml(jsxCode: string): Promise<{ html: string; variables: string[] }> {
  try {
    // Compile JSX to JavaScript
    const compiledCode = await esbuild.transform(jsxCode, {
      loader: 'jsx',
      jsx: 'automatic',
      format: 'cjs',
      target: 'node14'
    });

    // Create a mock require function for React
    const mockRequire = (module: string) => {
      if (module === 'react') {
        return React;
      }
      if (module === 'react/jsx-runtime') {
        return {
          jsx: React.createElement,
          jsxs: React.createElement,
          Fragment: React.Fragment
        };
      }
      throw new Error(`Module ${module} not found`);
    };

    // Evaluate the compiled code
    const componentFactory = new Function('require', 'exports', 'module', compiledCode.code);
    const moduleExports = { exports: {} };
    componentFactory(mockRequire, moduleExports, moduleExports);
    
    // Get the default export or named export
    const exports = moduleExports.exports as any;
    let Component = exports.default || exports;
    
    // If no default export, try to find any function export
    if (!Component || typeof Component !== 'function') {
      const exportKeys = Object.keys(exports);
      const functionExports = exportKeys.filter(key => typeof exports[key] === 'function');
      
      if (functionExports.length > 0) {
        Component = exports[functionExports[0]];
        console.log(`Using named export: ${functionExports[0]}`);
      }
    }
    
    if (!Component || typeof Component !== 'function') {
      console.error('Available exports:', Object.keys(exports));
      throw new Error('No valid component function found in JSX code');
    }

    // Create a proxy for template variables
    const templateProxy = createTemplateVariableProxy();
    
    // Render the component with the proxy
    const element = React.createElement(Component, templateProxy);
    const html = await render(element);
    
    // Extract variables from the JSX code by looking for function parameters
    const functionParamRegex = /function\s+\w+\s*\(\s*\{([^}]+)\}/;
    const arrowParamRegex = /\(\s*\{([^}]+)\}\s*\)\s*=>/;
    const destructuringRegex = /\(\s*\{([^}]+)\}\s*\)/;
    
    let variables: string[] = [];
    
    // Try to extract from function parameters
    const functionMatch = jsxCode.match(functionParamRegex) || jsxCode.match(arrowParamRegex) || jsxCode.match(destructuringRegex);
    if (functionMatch) {
      const paramString = functionMatch[1];
      variables = paramString
        .split(',')
        .map(param => param.trim())
        .filter(param => param.length > 0);
    }
    
    // Also try to extract from the rendered HTML as fallback
    const variableRegex = /\{\{(\w+)\}\}/g;
    let match;
    while ((match = variableRegex.exec(html)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }
    
    return { html, variables };
  } catch (error) {
    console.error('Error rendering JSX to HTML:', error);
    throw new Error(`Failed to render JSX: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to create or update SES email template
async function createOrUpdateSesTemplate(templateName: string, htmlContent: string, subject: string = 'Email Template', variables: string[] = []): Promise<{ created: boolean; updated: boolean }> {
  try {
    // Create default template data with all detected variables
    const defaultTemplateData = variables.reduce((acc, variable) => {
      acc[variable] = `{{${variable}}}`;
      return acc;
    }, {} as Record<string, string>);

    // If no variables detected, create a basic default
    if (Object.keys(defaultTemplateData).length === 0) {
      defaultTemplateData['firstName'] = '{{firstName}}';
      defaultTemplateData['lastName'] = '{{lastName}}';
    }

    console.log(`Creating/updating SES template with default data:`, defaultTemplateData);

    // First, try to get the existing template to see if it exists
    try {
      await sesClient.send(new GetTemplateCommand({ TemplateName: templateName }));
      
      // Template exists, update it
      await sesClient.send(new UpdateTemplateCommand({
        Template: {
          TemplateName: templateName,
          SubjectPart: subject,
          HtmlPart: htmlContent,
          TextPart: 'This email requires HTML support to view properly.',
          DefaultTemplateData: JSON.stringify(defaultTemplateData)
        }
      }));
      
      console.log(`Updated SES template: ${templateName} with default data`);
      return { created: false, updated: true };
    } catch (error: any) {
      if (error.name === 'TemplateDoesNotExistException') {
        // Template doesn't exist, create it
        await sesClient.send(new CreateTemplateCommand({
          Template: {
            TemplateName: templateName,
            SubjectPart: subject,
            HtmlPart: htmlContent,
            TextPart: 'This email requires HTML support to view properly.',
            DefaultTemplateData: JSON.stringify(defaultTemplateData)
          }
        }));
        
        console.log(`Created SES template: ${templateName} with default data`);
        return { created: true, updated: false };
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error managing SES template:', error);
    throw new Error(`Failed to create/update SES template: ${error instanceof Error ? error.message : String(error)}`);
  }
}

interface CreateCampaignRequest {
  name: string;
  description?: string;
  templateId?: string; // Made optional
  templateVersion?: string; // Changed to string to match our versioning
  audienceSelection: {
    type: 'tag' | 'list' | 'all';
    values: string[];
  };
  recipients?: {
    type: 'groups' | 'all_audience';
    groupIds?: string[];
  };
  status?: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledAt?: string; // ISO
  metadata?: {
    subject?: string;
    fromName?: string;
    fromEmail?: string;
    previewText?: string;
  };
}

interface CreateCampaignResponse {
  success: boolean;
  campaignId?: string;
  campaign?: any;
  message?: string;
  indexesCreated?: number;
  template?: {
    templateId?: string;
    version?: string;
    s3Path?: string;
    name?: string;
    description?: string;
    category?: string;
  };
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<CreateCampaignResponse> => {
  const userId = event.pathParameters?.userId || (event.body ? JSON.parse(event.body).userId : undefined);
  if (!userId) {
    throw new HttpError(400, 'userId is required');
  }

  const body = event.body ? JSON.parse(event.body) as CreateCampaignRequest : undefined;
  if (!body || !body.name || !body.audienceSelection) {
    throw new HttpError(400, 'name and audienceSelection are required');
  }

  try {
    const nowIso = new Date().toISOString();
    const campaignId = `cmp-${randomUUID().slice(0, 8)}`;
    
    // Retrieve template information if templateId is provided
    let templateInfo: any = null;
    
    if (body.templateId) {
      // Always use "latest" version for templates
      try {
        // Query DynamoDB for template metadata (always latest version)
        const templateQuery = await docClient.send(new QueryCommand({
          TableName: TABLE_NAMES.MAIN_TABLE,
          KeyConditionExpression: 'PK = :pk AND SK = :sk',
          ExpressionAttributeValues: {
            ':pk': `LAYOUT#${body.templateId}`,
            ':sk': 'VERSION#latest'
          }
        }));
        
        if (templateQuery.Items && templateQuery.Items.length > 0) {
          const templateItem = templateQuery.Items[0];
          templateInfo = {
            templateId: templateItem.layoutId,
            version: templateItem.version,
            s3Path: templateItem.s3Path,
            name: templateItem.name,
            description: templateItem.description,
            category: templateItem.category
          };
          
          console.log(`Template found: ${body.templateId} (latest version)`);
          
          // Create SES template from the layout
          try {
            console.log('Creating SES template from layout...');
            
            // Get the JSX code from S3
            const s3Key = `universal/${body.templateId}/latest/component.jsx`;
            const s3Response = await s3Client.send(new GetObjectCommand({
              Bucket: BUCKET_NAME,
              Key: s3Key
            }));
            
            const jsxCode = await s3Response.Body?.transformToString();
            if (!jsxCode) {
              throw new Error('Failed to retrieve JSX code from S3');
            }
            
            // Render JSX to HTML
            const { html: renderedHtml, variables } = await renderJsxToHtml(jsxCode);
            console.log(`Rendered HTML with variables: ${variables.join(', ')}`);
            
            // Create SES template with campaign ID as template name
            const sesTemplateResult = await createOrUpdateSesTemplate(
              campaignId, // Use campaign ID as template name
              renderedHtml,
              body.metadata?.subject || templateInfo.name || 'Email Template',
              variables // Pass the detected variables for default template data
            );
            
            console.log(`SES template created: ${campaignId} (${sesTemplateResult.created ? 'created' : 'updated'})`);
            
            // Add SES template info to templateInfo
            templateInfo.sesTemplate = {
              templateName: campaignId,
              created: sesTemplateResult.created,
              updated: sesTemplateResult.updated,
              variables: variables
            };
            
          } catch (sesError) {
            console.error('Error creating SES template:', sesError);
            // Don't fail the campaign creation if SES template creation fails
            console.warn('Continuing campaign creation without SES template');
          }
        } else {
          console.warn(`Template not found: ${body.templateId} (latest version)`);
        }
      } catch (templateError) {
        console.error('Error retrieving template:', templateError);
        // Don't fail the campaign creation if template retrieval fails
        console.warn('Continuing campaign creation without template info');
      }
    }

    // Determine recipients based on audienceSelection
    let recipients: { type: 'groups' | 'all_audience'; groupIds?: string[] } = {
      type: 'all_audience'
    };

    if (body.recipients) {
      recipients = body.recipients;
    } else if (body.audienceSelection.type === 'tag') {
      // Map tags to group IDs (assuming tags are group IDs)
      recipients = {
        type: 'groups',
        groupIds: body.audienceSelection.values
      };
    } else if (body.audienceSelection.type === 'list') {
      // For list-based campaigns, we'll store as all_audience since it's a specific list
      recipients = {
        type: 'all_audience'
      };
    }

    const status = body.status ?? 'draft';
    const item = {
      userId,
      campaignId,
      name: body.name,
      description: body.description,
      templateId: body.templateId || '',
      templateVersion: 'latest',
      audienceSelection: body.audienceSelection,
      recipients: recipients,
      status: status,
      scheduledAt: body.scheduledAt,
      createdAt: nowIso,
      lastModified: nowIso,
      metadata: body.metadata ?? {}
    };

    // Create main campaign record in the main table
    const mainCampaignRecord = {
      PK: `USER#${userId}`,
      SK: `CAMPAIGN#${campaignId}`,
      ...item
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAMES.MAIN_TABLE,
      Item: mainCampaignRecord,
      ConditionExpression: 'attribute_not_exists(#PK) AND attribute_not_exists(#SK)',
      ExpressionAttributeNames: {
        '#PK': 'PK',
        '#SK': 'SK'
      }
    }));

    // Create index records in the main table for efficient querying
    const indexRecords = [
      // 1. Organization Campaigns Index - All campaigns for an org
      {
        PK: `ORG_CAMPAIGNS#${userId}`,
        SK: `CAMPAIGN#${campaignId}`,
        userId: userId,
        campaignId: campaignId,
        name: body.name,
        description: body.description,
        templateId: body.templateId || '',
        templateVersion: 'latest',
        audienceSelection: body.audienceSelection,
        recipients: recipients,
        status: status,
        scheduledAt: body.scheduledAt,
        createdAt: nowIso,
        lastModified: nowIso,
        metadata: body.metadata ?? {}
      },
      // 2. Organization Status Campaigns Index - Campaigns by org and status
      {
        PK: `ORG_STATUS_CAMPAIGNS#${userId}#${status}`,
        SK: `CAMPAIGN#${campaignId}`,
        userId: userId,
        campaignId: campaignId,
        name: body.name,
        description: body.description,
        templateId: body.templateId || '',
        templateVersion: 'latest',
        audienceSelection: body.audienceSelection,
        recipients: recipients,
        status: status,
        scheduledAt: body.scheduledAt,
        createdAt: nowIso,
        lastModified: nowIso,
        metadata: body.metadata ?? {}
      }
    ];

    // Add group-specific index records if recipients are group-based
    if (recipients.type === 'groups' && recipients.groupIds) {
      recipients.groupIds.forEach(groupId => {
        indexRecords.push({
          PK: `GROUP_CAMPAIGNS#${userId}#${groupId}`,
          SK: `CAMPAIGN#${campaignId}`,
          userId: userId,
          campaignId: campaignId,
          groupId: groupId,
          name: body.name,
          description: body.description,
          templateId: body.templateId,
          templateVersion: body.templateVersion ?? 1,
          audienceSelection: body.audienceSelection,
          recipients: recipients,
          status: status,
          scheduledAt: body.scheduledAt,
          createdAt: nowIso,
          lastModified: nowIso,
          metadata: body.metadata ?? {}
        } as any); // Type assertion to handle the groupId property
      });
    }

    // Add audience member index records for all audience members
    // This will be populated when the campaign is sent, but we can create the structure here
    // For now, we'll create a placeholder that gets updated during send
    if (recipients.type === 'all_audience') {
      // Create a marker record that indicates this campaign targets all audience
      indexRecords.push({
        PK: `ALL_AUDIENCE_CAMPAIGNS#${userId}`,
        SK: `CAMPAIGN#${campaignId}`,
        userId: userId,
        campaignId: campaignId,
        name: body.name,
        description: body.description,
        templateId: body.templateId || '',
        templateVersion: 'latest',
        audienceSelection: body.audienceSelection,
        recipients: recipients,
        status: status,
        scheduledAt: body.scheduledAt,
        createdAt: nowIso,
        lastModified: nowIso,
        metadata: body.metadata ?? {}
      } as any);
    }

    // Create all index records using batch write
    const batchRequests = indexRecords.map(record => ({
      PutRequest: {
        Item: record
      }
    }));

    // Process in batches of 25 (DynamoDB limit)
    for (let i = 0; i < batchRequests.length; i += 25) {
      const batch = batchRequests.slice(i, i + 25);
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAMES.MAIN_TABLE]: batch
        }
      }));
    }

    return { 
      success: true, 
      campaignId, 
      campaign: mainCampaignRecord, 
      message: 'Campaign created with all index records in main table',
      indexesCreated: indexRecords.length + 1, // +1 for the main campaign record
      template: templateInfo
    };
  } catch (error) {
    console.error('Error creating campaign:', error);
    throw new HttpError(500, `Failed to create campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
