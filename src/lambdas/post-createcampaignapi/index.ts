

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

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

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
    
    // Extract variables from function parameters first
    const functionParamRegex = /function\s+\w+\s*\(\s*\{([^}]+)\}/;
    const arrowParamRegex = /\(\s*\{([^}]+)\}\s*\)\s*=>/;
    const destructuringRegex = /\(\s*\{([^}]+)\}\s*\)/;
    const exportDefaultRegex = /export\s+default\s+function\s+\w+\s*\(\s*\{([^}]+)\}\s*:?\s*\w*\s*\)/;
    
    let paramVariables: string[] = [];
    const functionMatch = jsxCode.match(exportDefaultRegex) || jsxCode.match(functionParamRegex) || jsxCode.match(arrowParamRegex) || jsxCode.match(destructuringRegex);
    if (functionMatch) {
      const paramString = functionMatch[1];
      paramVariables = paramString
        .split(',')
        .map(param => param.trim())
        .map(param => param.replace(/\?:\s*\w+.*$/, '').replace(/=\s*[^,]+/, '').trim()) // Remove TypeScript types and default values
        .filter(param => param.length > 0);
    }
    
    // Create props object with all detected variables
    const propsWithVariables: any = {};
    paramVariables.forEach(variable => {
      propsWithVariables[variable] = `{{${variable}}}`;
    });
    
    // Render the component with proper props
    const element = React.createElement(Component, propsWithVariables);
    const html = await render(element);
    
    // Extract variables from the rendered HTML by finding all {{variableName}} patterns
    const variableMatches = html.match(/\{\{([^}]+)\}\}/g) || [];
    const htmlVariables = [...new Set(variableMatches.map(match => match.slice(2, -2)))];
    
    // Combine parameter variables and HTML variables
    const allVariables = [...new Set([...paramVariables, ...htmlVariables])];
    
    console.log('Detected variables from parameters:', paramVariables);
    console.log('Detected variables from rendered HTML:', htmlVariables);
    console.log('All variables:', allVariables);
    
    return { html, variables: allVariables };
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
          TextPart: 'This email requires HTML support to view properly.'
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
            TextPart: 'This email requires HTML support to view properly.'
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
  cognitoId: string;
  name: string;
  description?: string;
  layoutId?: string;
  layoutVersion?: string;
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
    fromEmail?: string; // Optional - will be automatically set from ORGMETADATA
    previewText?: string;
  };
}

interface CreateCampaignResponse {
  success: boolean;
  cognitoId?: string;
  campaignId?: string;
  campaign?: any;
  message?: string;
  recordsCreated?: number;
  layout?: {
    layoutId?: string;
    layoutVersion?: string;
    s3Path?: string;
    name?: string;
    description?: string;
    category?: string;
  };
  renderedHtml?: string;
  layoutRetrieved?: boolean;
  sesTemplate?: {
    templateName?: string;
    created?: boolean;
    updated?: boolean;
    variables?: string[];
    error?: string;
  };
}

// Function to retrieve JSX code from S3 and render it to HTML
async function retrieveAndRenderLayoutFromS3(layoutId: string, layoutVersion: string): Promise<{ html: string | null; retrieved: boolean }> {
  try {
    const s3Key = `${layoutId}/${layoutVersion}/${layoutId}.jsx`;
    console.log(`Retrieving layout from S3: ${s3Key}`);
    
    const result = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key
    }));
    
    if (result.Body) {
      const jsxCode = await result.Body.transformToString();
      console.log(`Successfully retrieved JSX code (${jsxCode.length} characters)`);
      
      // Render JSX to HTML using the existing renderJsxToHtml function
      const renderedResult = await renderJsxToHtml(jsxCode);
      console.log(`Successfully rendered JSX to HTML (${renderedResult.html.length} characters)`);
      
      return {
        html: renderedResult.html,
        retrieved: true
      };
    }
    
    return { html: null, retrieved: false };
  } catch (error) {
    console.error(`Error retrieving or rendering layout from S3: ${layoutId}/${layoutVersion}:`, error);
    return { html: null, retrieved: false };
  }
}

// Function to retrieve organization metadata to get senderEmail
async function retrieveOrganizationMetadata(cognitoId: string): Promise<string | null> {
  try {
    const orgQuery = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${cognitoId}`,
        ':sk': 'ORGMETADATA'
      },
      Limit: 1 // Just get the first organization record
    }));

    if (orgQuery.Items && orgQuery.Items.length > 0) {
      const orgData = orgQuery.Items[0];
      console.log(`Found organization metadata for ${cognitoId}:`, orgData.senderEmail);
      return orgData.senderEmail || null;
    }

    console.warn(`No organization metadata found for ${cognitoId}`);
    return null;
  } catch (error) {
    console.error('Error retrieving organization metadata:', error);
    return null;
  }
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<CreateCampaignResponse> => {
  const body = event.body ? JSON.parse(event.body) as CreateCampaignRequest : undefined;
  
  if (!body) {
    throw new HttpError(400, 'Request body is required');
  }

  if (!body.cognitoId || typeof body.cognitoId !== 'string') {
    throw new HttpError(400, 'cognitoId is required and must be a string');
  }

  if (!body.name || typeof body.name !== 'string') {
    throw new HttpError(400, 'name is required and must be a string');
  }

  if (!body.audienceSelection || !body.audienceSelection.type) {
    throw new HttpError(400, 'audienceSelection is required');
  }

  try {
    const nowIso = new Date().toISOString();
    const campaignId = `cmp-${randomUUID().slice(0, 8)}`;
    
    // Retrieve layout information if layoutId is provided
    let layoutInfo: any = null;
    let renderedHtml: string | null = null;
    let layoutRetrieved = false;
    let sesTemplateInfo: any = null;
    
    if (body.layoutId) {
      // Always use "latest" version for templates
      try {
        // Query DynamoDB for layout metadata
        const layoutQuery = await docClient.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND SK = :sk',
          ExpressionAttributeValues: {
            ':pk': `LAYOUT#${body.layoutId}`,
            ':sk': `VERSION#${body.layoutVersion || 'latest'}`
          }
        }));
        
        if (layoutQuery.Items && layoutQuery.Items.length > 0) {
          const layoutItem = layoutQuery.Items[0];
          layoutInfo = {
            layoutId: layoutItem.layoutId,
            layoutVersion: layoutItem.version,
            s3Path: layoutItem.s3Path,
            name: layoutItem.name,
            description: layoutItem.description,
            category: layoutItem.category
          };
          
          console.log(`Layout found: ${body.layoutId} (version: ${body.layoutVersion || 'latest'})`);
          
          // Create SES template from the layout
          try {
            console.log('Creating SES template from layout...');
            
            // Get the JSX code from S3
            const s3Key = layoutItem.s3JsxPath;
            const s3Response = await s3Client.send(new GetObjectCommand({
              Bucket: BUCKET_NAME,
              Key: s3Key
            }));
            
            const jsxCode = await s3Response.Body?.transformToString();
            if (!jsxCode) {
              throw new Error('Failed to retrieve JSX code from S3');
            }
            
            // Render JSX to HTML
            const { html: renderedHtmlFromJsx, variables } = await renderJsxToHtml(jsxCode);
            console.log(`Rendered HTML with variables: ${variables.join(', ')}`);
            
            // Store the rendered HTML for return
            renderedHtml = renderedHtmlFromJsx;
            layoutRetrieved = true;
            
            // Create SES template with cognitoId_campaignId format
            const templateName = `${body.cognitoId}_${campaignId}`;
            const sesTemplateResult = await createOrUpdateSesTemplate(
              templateName, // Use cognitoId_campaignId format
              renderedHtml,
              body.metadata?.subject || layoutInfo.name || 'Email Template',
              variables // Pass the detected variables for default template data
            );
            
            console.log(`SES template created: ${templateName} (${sesTemplateResult.created ? 'created' : 'updated'})`);
            
            // Store SES template info separately (not in layoutInfo)
            sesTemplateInfo = {
              templateName: templateName,
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
          console.warn(`Layout not found: ${body.layoutId} (version: ${body.layoutVersion || 'latest'})`);
        }
      } catch (layoutError) {
        console.error('Error retrieving layout:', layoutError);
        // Don't fail the campaign creation if layout retrieval fails
        console.warn('Continuing campaign creation without layout info');
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
    
    // Retrieve organization's senderEmail from ORGMETADATA
    const orgSenderEmail = await retrieveOrganizationMetadata(body.cognitoId);
    
    // Prepare campaign metadata with automatic fromEmail from organization
    const campaignMetadata = {
      ...body.metadata,
      fromEmail: orgSenderEmail || body.metadata?.fromEmail || 'noreply@goodbricks.org' // Fallback hierarchy
    };
    
    console.log(`Using senderEmail from organization: ${orgSenderEmail || 'fallback'}`);
    
    const campaignData = {
      userId: body.cognitoId,
      campaignId: campaignId,
      name: body.name,
      description: body.description || '',
      layoutId: body.layoutId || '',
      layoutVersion: body.layoutVersion || 'latest',
      audienceSelection: body.audienceSelection,
      recipients: recipients,
      status: status,
      scheduledAt: body.scheduledAt || null,
      sentAt: null,
      createdAt: nowIso,
      lastModified: nowIso,
      metadata: campaignMetadata
    };

    // Create records to be written to DynamoDB
    const recordsToCreate = [];

    // 1. Primary Record: USER#{cognitoId} + CAMPAIGN#{campaignId}
    const primaryRecord = {
      PK: `USER#${body.cognitoId}`,
      SK: `CAMPAIGN#${campaignId}`,
      ...campaignData
    };
    recordsToCreate.push(primaryRecord);

    // 2. Status Index Record: USER#{cognitoId} + STATUS#draft#CAMPAIGN#{campaignId}
    const statusIndexRecord = {
      PK: `USER#${body.cognitoId}`,
      SK: `STATUS#${status}#CAMPAIGN#${campaignId}`,
      ...campaignData
    };
    recordsToCreate.push(statusIndexRecord);

    // 3. Group Campaign Records (if targeting groups)
    if (recipients.type === 'groups' && recipients.groupIds && recipients.groupIds.length > 0) {
      for (const groupId of recipients.groupIds) {
        // Group Campaign Record: USER#{cognitoId}#GROUP#{groupId} + CAMPAIGN#{campaignId}
        const groupCampaignRecord = {
          PK: `USER#${body.cognitoId}#GROUP#${groupId}`,
          SK: `CAMPAIGN#${campaignId}`,
          ...campaignData,
          groupId: groupId
        };
        recordsToCreate.push(groupCampaignRecord);

        // Group Status Campaign Record: USER#{cognitoId}#GROUP#{groupId} + STATUS#draft#CAMPAIGN#{campaignId}
        const groupStatusCampaignRecord = {
          PK: `USER#${body.cognitoId}#GROUP#${groupId}`,
          SK: `STATUS#${status}#CAMPAIGN#${campaignId}`,
          ...campaignData,
          groupId: groupId
        };
        recordsToCreate.push(groupStatusCampaignRecord);
      }
    }

    // Create all records using batch write
    const batchRequests = recordsToCreate.map(record => ({
      PutRequest: {
        Item: record,
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
      }
    }));

    // Process in batches of 25 (DynamoDB limit)
    for (let i = 0; i < batchRequests.length; i += 25) {
      const batch = batchRequests.slice(i, i + 25);
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch
        }
      }));
    }

    return { 
      success: true,
      cognitoId: body.cognitoId,
      campaignId, 
      campaign: primaryRecord, 
      message: 'Campaign created successfully with all required records',
      recordsCreated: recordsToCreate.length,
      layout: layoutInfo,
      renderedHtml: renderedHtml || undefined,
      layoutRetrieved: layoutRetrieved,
      sesTemplate: sesTemplateInfo
    };
  } catch (error) {
    console.error('Error creating campaign:', error);
    throw new HttpError(500, `Failed to create campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
