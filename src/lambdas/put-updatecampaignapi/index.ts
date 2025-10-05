import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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

interface UpdateCampaignRequest {
  cognitoId: string;
  campaignId: string;
  name?: string;
  description?: string;
  status?: string;
  layoutId?: string;
  layoutVersion?: string;
  recipients?: {
    type: 'groups' | 'all_audience';
    groupIds?: string[];
  };
  metadata?: any;
}

interface UpdateCampaignResponse {
  success: boolean;
  cognitoId?: string;
  campaignId?: string;
  campaign?: any;
  message?: string;
  renderedHtml?: string;
  layoutRetrieved?: boolean;
  layoutInfo?: {
    layoutId?: string;
    layoutVersion?: string;
    name?: string;
    description?: string;
    category?: string;
  };
  sesTemplate?: {
    templateName?: string;
    created?: boolean;
    updated?: boolean;
    variables?: string[];
    error?: string;
  };
}

// Function to render JSX to HTML (copied from create layout API)
async function renderJsxToHtml(jsxCode: string): Promise<{ html: string; variables: string[] }> {
  try {
    // Compile JSX to JavaScript using esbuild
    const result = await esbuild.build({
      stdin: {
        contents: jsxCode,
        loader: 'tsx',
        resolveDir: '/tmp'
      },
      bundle: true,
      format: 'cjs',
      write: false,
      external: ['react', 'react-dom', '@react-email/components']
    });

    if (!result.outputFiles || result.outputFiles.length === 0) {
      throw new Error('No output files generated');
    }

    const compiledCode = result.outputFiles[0].text;
    
    // Create a require function that provides real React and React Email components
    const mockRequire = (module: string) => {
      if (module === 'react') {
        return React;
      }
      if (module === '@react-email/components') {
        return {
          Body: React.createElement,
          Column: React.createElement,
          Container: React.createElement,
          Head: React.createElement,
          Heading: React.createElement,
          Hr: React.createElement,
          Html: React.createElement,
          Link: React.createElement,
          Preview: React.createElement,
          Row: React.createElement,
          Section: React.createElement,
          Tailwind: React.createElement,
          Text: React.createElement,
        };
      }
      throw new Error(`Module ${module} not found`);
    };

    // Evaluate the compiled code
    const componentFactory = new Function('require', 'exports', 'module', compiledCode);
    const moduleExports = { exports: {} as any };
    componentFactory(mockRequire, moduleExports, moduleExports);

    const Component = moduleExports.exports.default;
    if (!Component) {
      throw new Error('No default export found in JSX code');
    }

    // Create template variable proxy that converts React props to {{variableName}} format
    const createTemplateVariableProxy = (props: any) => {
      return new Proxy(props, {
        get(target, prop) {
          const value = target[prop];
          if (typeof value === 'string') {
            return `{{${String(prop)}}}`;
          }
          return value;
        }
      });
    };

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
    
    // Render the component to HTML with proper props
    const html = await render(Component(propsWithVariables));
    
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

// Function to create or update SES template
async function createOrUpdateSesTemplate(
  templateName: string, 
  htmlContent: string, 
  subject: string,
  variables: string[]
): Promise<{ created: boolean; updated: boolean; error?: string }> {
  try {
    // Check if template already exists
    let templateExists = false;
    try {
      await sesClient.send(new GetTemplateCommand({
        TemplateName: templateName
      }));
      templateExists = true;
    } catch (error: any) {
      if (error.name !== 'TemplateDoesNotExistException') {
        throw error;
      }
    }

    // Create template variables for subject
    const subjectWithVariables = variables.includes('subject') ? '{{subject}}' : subject;
    
    const templateCommand = templateExists 
      ? new UpdateTemplateCommand({
          Template: {
            TemplateName: templateName,
            SubjectPart: subjectWithVariables,
            HtmlPart: htmlContent,
            TextPart: htmlContent.replace(/<[^>]*>/g, '') // Simple HTML to text conversion
          }
        })
      : new CreateTemplateCommand({
          Template: {
            TemplateName: templateName,
            SubjectPart: subjectWithVariables,
            HtmlPart: htmlContent,
            TextPart: htmlContent.replace(/<[^>]*>/g, '')
          }
        });

    await sesClient.send(templateCommand);
    
    console.log(`SES template ${templateExists ? 'updated' : 'created'}: ${templateName}`);
    
    return {
      created: !templateExists,
      updated: templateExists
    };
    
  } catch (error) {
    console.error('Error creating/updating SES template:', error);
    return {
      created: false,
      updated: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<UpdateCampaignResponse> => {
  try {
    const body = event.body ? JSON.parse(event.body) as UpdateCampaignRequest : undefined;
    
    if (!body) {
      throw new HttpError(400, 'Request body is required');
    }

    if (!body.cognitoId || typeof body.cognitoId !== 'string') {
      throw new HttpError(400, 'cognitoId is required and must be a string');
    }

    if (!body.campaignId || typeof body.campaignId !== 'string') {
      throw new HttpError(400, 'campaignId is required and must be a string');
    }

    console.log('Starting campaign update for:', body.cognitoId, body.campaignId);
    console.log('Update fields:', JSON.stringify(body, null, 2));

    // First, get the current campaign
    const currentCampaignResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${body.cognitoId}`,
        SK: `CAMPAIGN#${body.campaignId}`
      }
    }));

    if (!currentCampaignResult.Item) {
      throw new HttpError(404, 'Campaign not found');
    }

    console.log('Found campaign:', JSON.stringify(currentCampaignResult.Item, null, 2));

    const nowIso = new Date().toISOString();
    const currentCampaign = currentCampaignResult.Item;

    // Build update expression
    const setExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Always update lastModified
    setExpressions.push('#lastModified = :lastModified');
    expressionAttributeNames['#lastModified'] = 'lastModified';
    expressionAttributeValues[':lastModified'] = nowIso;

    // Add fields to update if provided
    if (body.name !== undefined) {
      setExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = body.name;
    }

    if (body.description !== undefined) {
      setExpressions.push('#description = :description');
      expressionAttributeNames['#description'] = 'description';
      expressionAttributeValues[':description'] = body.description;
    }

    if (body.status !== undefined) {
      setExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = body.status;
    }

    if (body.recipients !== undefined) {
      setExpressions.push('#recipients = :recipients');
      expressionAttributeNames['#recipients'] = 'recipients';
      expressionAttributeValues[':recipients'] = body.recipients;
    }

    if (body.metadata !== undefined) {
      setExpressions.push('#metadata = :metadata');
      expressionAttributeNames['#metadata'] = 'metadata';
      expressionAttributeValues[':metadata'] = { ...currentCampaign.metadata, ...body.metadata };
    }

    if (body.layoutId !== undefined) {
      setExpressions.push('#layoutId = :layoutId');
      expressionAttributeNames['#layoutId'] = 'layoutId';
      expressionAttributeValues[':layoutId'] = body.layoutId;
    }

    if (body.layoutVersion !== undefined) {
      setExpressions.push('#layoutVersion = :layoutVersion');
      expressionAttributeNames['#layoutVersion'] = 'layoutVersion';
      expressionAttributeValues[':layoutVersion'] = body.layoutVersion;
    }

    console.log('Update expression:', `SET ${setExpressions.join(', ')}`);
    console.log('Expression values:', JSON.stringify(expressionAttributeValues, null, 2));

    // Handle layout assignment and JSX retrieval if layoutId is being set or updated
    let layoutInfo: any = null;
    let renderedHtml: string | null = null;
    let layoutRetrieved = false;
    
    if (body.layoutId !== undefined && body.layoutId !== '') {
      console.log(`Layout being assigned: ${body.layoutId} (version: ${body.layoutVersion || 'latest'})`);
      
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
            name: layoutItem.name,
            description: layoutItem.description,
            category: layoutItem.category
          };
          
          console.log(`Layout found: ${body.layoutId} (version: ${body.layoutVersion || 'latest'})`);
          
          // Retrieve JSX from S3 and render to HTML
          const renderedResult = await retrieveAndRenderLayoutFromS3(body.layoutId, body.layoutVersion || 'latest');
          if (renderedResult.retrieved && renderedResult.html) {
            renderedHtml = renderedResult.html;
            layoutRetrieved = true;
            console.log(`Successfully retrieved and rendered layout: ${body.layoutId}`);
          } else {
            console.warn(`Failed to retrieve JSX for layout: ${body.layoutId}`);
          }
          
        } else {
          console.warn(`Layout not found: ${body.layoutId} (version: ${body.layoutVersion || 'latest'})`);
        }
      } catch (layoutError) {
        console.error('Error retrieving layout:', layoutError);
        // Don't fail the campaign update if layout retrieval fails
        console.warn('Continuing campaign update without layout info');
      }
    }

    // Handle SES template creation if layout was successfully retrieved
    let sesTemplateInfo: any = null;
    if (layoutRetrieved && renderedHtml) {
      try {
        // Extract variables from rendered HTML
        const variableMatches = renderedHtml.match(/\{\{([^}]+)\}\}/g) || [];
        const variables = [...new Set(variableMatches.map(match => match.slice(2, -2)))];
        
        // Create template name: {cognitoId}_{campaignId}
        const templateName = `${body.cognitoId}_${body.campaignId}`;
        
        // Get subject from campaign metadata
        const subject = currentCampaign.metadata?.subject || body.name || 'Email from GoodBricks';
        
        console.log(`Creating SES template: ${templateName} with variables:`, variables);
        
        // Create or update SES template
        const sesResult = await createOrUpdateSesTemplate(templateName, renderedHtml, subject, variables);
        
        sesTemplateInfo = {
          templateName: templateName,
          created: sesResult.created,
          updated: sesResult.updated,
          variables: variables,
          error: sesResult.error
        };
        
        if (sesResult.error) {
          console.error(`SES template creation failed: ${sesResult.error}`);
        } else {
          console.log(`SES template ${sesResult.created ? 'created' : 'updated'} successfully: ${templateName}`);
        }
        
      } catch (sesError) {
        console.error('Error creating SES template:', sesError);
        sesTemplateInfo = {
          templateName: `${body.cognitoId}_${body.campaignId}`,
          created: false,
          updated: false,
          error: sesError instanceof Error ? sesError.message : 'Unknown error'
        };
      }
    }

    // Update the primary campaign record
    const updateCommand = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { 
        PK: `USER#${body.cognitoId}`,
        SK: `CAMPAIGN#${body.campaignId}`
      },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    });

    const result = await docClient.send(updateCommand);
    
    if (!result.Attributes) {
      throw new HttpError(500, 'Campaign update failed');
    }

    console.log('Campaign updated successfully');

    return {
      success: true,
      cognitoId: body.cognitoId,
      campaignId: body.campaignId,
      campaign: result.Attributes,
      message: 'Campaign updated successfully',
      renderedHtml: renderedHtml || undefined,
      layoutRetrieved: layoutRetrieved,
      layoutInfo: layoutInfo,
      sesTemplate: sesTemplateInfo
    };

  } catch (error) {
    console.error('Error updating campaign:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(500, `Failed to update campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
