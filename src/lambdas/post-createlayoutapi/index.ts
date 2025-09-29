import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { HttpError } from '../../lib/http.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import * as esbuild from 'esbuild';
import { render } from '@react-email/render';
import React from 'react';

interface CreateLayoutRequest {
  layoutId: string;
  version?: string;
  jsxCode: string;
  name?: string;
  description?: string;
  category?: string;
  bucketName?: string;
  region?: string;
}

interface CreateLayoutResponse {
  success: boolean;
  layoutId: string;
  version: string;
  s3Key: string;
  bucketName: string;
  metadata: {
    name?: string;
    description?: string;
    category?: string;
    uploadedAt: string;
  };
  dynamoItems: number;
  isFirstVersion: boolean;
  latestVersionCreated: boolean;
  renderedHtml: string;
  detectedVariables: string[];
}

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';



// Function to create a proxy object that intercepts property access
function createTemplateVariableProxy(): any {
  return new Proxy({}, {
    get(target, prop) {
      if (typeof prop === 'string') {
        return `{{${prop}}}`;
      }
      return `{{${String(prop)}}}`;
    },
    has(target, prop) {
      return true; // Always return true so the component thinks the property exists
    },
    ownKeys(target) {
      return []; // Return empty array for Object.keys()
    },
    getOwnPropertyDescriptor(target, prop) {
      return {
        enumerable: true,
        configurable: true,
        value: `{{${String(prop)}}}`
      };
    }
  });
}

// Function to render JSX to HTML with completely dynamic variable handling
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
      external: ['react', 'react-dom']
    });

    if (!result.outputFiles || result.outputFiles.length === 0) {
      throw new Error('No output files generated');
    }

    const compiledCode = result.outputFiles[0].text;
    
    // Create a require function that provides real React
    const mockRequire = (module: string) => {
      if (module === 'react') {
        return React;
      }
      throw new Error(`Module ${module} not found`);
    };

    // Evaluate the compiled code
    const componentFactory = new Function('require', 'exports', 'module', compiledCode);
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

    // Create a proxy object that returns template variables for any property access
    const templateProps = createTemplateVariableProxy();

    // Render the component to HTML - any variable access will return {{variableName}}
    const html = await render(Component(templateProps));
    
    // Extract variables from the rendered HTML by finding all {{variableName}} patterns
    const variableMatches = html.match(/\{\{([^}]+)\}\}/g) || [];
    const variables = [...new Set(variableMatches.map(match => match.slice(2, -2)))];
    
    console.log('Detected variables from rendered HTML:', variables);
    
    return { html, variables };
  } catch (error) {
    console.error('Error rendering JSX to HTML:', error);
    throw new Error(`Failed to render JSX: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<CreateLayoutResponse> => {
  if (event.body == null) throw new HttpError(400, 'Request body is required');
  
  const body: CreateLayoutRequest = typeof event.body === 'string' 
    ? JSON.parse(event.body) 
    : (event.body as any);

  const { 
    layoutId, 
    version = 'latest', 
    jsxCode, 
    name, 
    description, 
    category,
    bucketName = 'gb-email-layouts-900546257868-us-west-1',
    region = 'us-west-1'
  } = body;

  if (!layoutId) throw new HttpError(400, 'layoutId is required');
  if (!jsxCode) throw new HttpError(400, 'jsxCode is required');

  const s3Client = new S3Client({ region });
  const s3Key = `universal/${layoutId}/${version}/component.jsx`;
  
  try {
    // Render JSX to HTML first
    console.log('Rendering JSX to HTML...');
    let renderResult: { html: string; variables: string[] };
    try {
      renderResult = await renderJsxToHtml(jsxCode);
      console.log('JSX rendered successfully');
    } catch (renderError) {
      console.error('Failed to render JSX:', renderError);
      throw new HttpError(400, `Failed to render JSX: ${renderError instanceof Error ? renderError.message : String(renderError)}`);
    }
    
    const { html: renderedHtml, variables: detectedVariables } = renderResult;

    // Check if this is the first version of this layout
    const existingLayoutQuery = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `LAYOUT#${layoutId}`
      },
      Limit: 1
    }));
    
    const isFirstVersion = !existingLayoutQuery.Items || existingLayoutQuery.Items.length === 0;
    
    // Note: SES template creation is now handled in the create campaign lambda
    console.log('Layout created successfully. SES template will be created when campaign is created.');
    
    // 1. Upload JSX to S3
    const s3Command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: jsxCode,
      ContentType: 'text/javascript',
      Metadata: {
        'layout-id': layoutId,
        'version': version,
        'name': name || '',
        'description': description || '',
        'category': category || '',
        'uploaded-at': new Date().toISOString()
      }
    });
    
    await s3Client.send(s3Command);
    
    // If this is the first version, also create a "latest" version
    let latestVersionCreated = false;
    if (isFirstVersion) {
      const latestS3Key = `universal/${layoutId}/latest/component.jsx`;
      const latestS3Command = new PutObjectCommand({
        Bucket: bucketName,
        Key: latestS3Key,
        Body: jsxCode,
        ContentType: 'text/javascript',
        Metadata: {
          'layout-id': layoutId,
          'version': 'latest',
          'name': name || '',
          'description': description || '',
          'category': category || '',
          'uploaded-at': new Date().toISOString()
        }
      });
      
      await s3Client.send(latestS3Command);
      latestVersionCreated = true;
      console.log(`Created latest version for new layout: ${layoutId}`);
    }
    
    // 2. Write metadata to DynamoDB
    const now = new Date().toISOString();
    const dynamoItems = [];
    
    // Primary layout metadata record
    dynamoItems.push({
      PK: `LAYOUT#${layoutId}`,
      SK: `VERSION#${version}`,
      layoutId,
      version,
      name: name || '',
      description: description || '',
      category: category || '',
      s3Path: `universal/${layoutId}/${version}/`,
      s3JsxPath: s3Key,
      isUniversal: true,
      createdAt: now,
      lastModified: now,
      createdBy: 'system'
    });
    
    // Category index record
    if (category) {
      dynamoItems.push({
        PK: `LAYOUT_CATEGORY#${category}`,
        SK: `LAYOUT#${layoutId}#VERSION#${version}`,
        layoutId,
        version,
        category,
        s3Path: `universal/${layoutId}/${version}/`,
        s3JsxPath: s3Key,
        isUniversal: true,
        createdAt: now,
        lastModified: now
      });
    }
    
    // If this is the first version, also create "latest" DynamoDB records
    if (isFirstVersion) {
      const latestS3Key = `universal/${layoutId}/latest/component.jsx`;
      
      // Primary layout metadata record for "latest"
      dynamoItems.push({
        PK: `LAYOUT#${layoutId}`,
        SK: `VERSION#latest`,
        layoutId,
        version: 'latest',
        name: name || '',
        description: description || '',
        category: category || '',
        s3Path: `universal/${layoutId}/latest/`,
        s3JsxPath: latestS3Key,
        isUniversal: true,
        createdAt: now,
        lastModified: now,
        createdBy: 'system'
      });
      
      // Category index record for "latest"
      if (category) {
        dynamoItems.push({
          PK: `LAYOUT_CATEGORY#${category}`,
          SK: `LAYOUT#${layoutId}#VERSION#latest`,
          layoutId,
          version: 'latest',
          category,
          s3Path: `universal/${layoutId}/latest/`,
          s3JsxPath: latestS3Key,
          isUniversal: true,
          createdAt: now,
          lastModified: now
        });
      }
    }
    
    // Write all DynamoDB items
    for (const item of dynamoItems) {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      }));
    }
    
    return {
      success: true,
      layoutId,
      version,
      s3Key,
      bucketName,
      metadata: {
        name,
        description,
        category,
        uploadedAt: now
      },
      dynamoItems: dynamoItems.length,
      isFirstVersion,
      latestVersionCreated,
      renderedHtml,
      detectedVariables,
    };
  } catch (error) {
    throw new HttpError(500, `Failed to create layout: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
