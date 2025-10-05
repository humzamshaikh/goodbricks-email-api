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
  layoutId?: string; // Optional - will be generated if not provided
  version?: string; // Optional - defaults to 'v1.0.0' for new layouts, 'latest' for updates
  jsxCode: string;
  name: string; // Required - layout name (e.g., 'welcome-series', 'monthly-update')
  description?: string;
  category: string; // Required - category (e.g., 'newsletters', 'promotional', 'transactional')
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
    name: string;
    description?: string;
    category: string;
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

// Function to generate next version number
function getNextVersion(existingVersions: string[]): string {
  if (existingVersions.length === 0) {
    return 'v1.0.0';
  }
  
  // Parse existing versions and find the highest
  const versionNumbers = existingVersions
    .filter(v => v.match(/^v\d+\.\d+\.\d+$/))
    .map(v => v.slice(1).split('.').map(Number))
    .filter(nums => nums.length === 3);
  
  if (versionNumbers.length === 0) {
    return 'v1.0.0';
  }
  
  // Find the highest version
  const highestVersion = versionNumbers.reduce((highest, current) => {
    if (current[0] > highest[0]) return current;
    if (current[0] === highest[0] && current[1] > highest[1]) return current;
    if (current[0] === highest[0] && current[1] === highest[1] && current[2] > highest[2]) return current;
    return highest;
  });
  
  // Increment patch version
  return `v${highestVersion[0]}.${highestVersion[1]}.${highestVersion[2] + 1}`;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<CreateLayoutResponse> => {
  try {
    if (event.body == null) throw new HttpError(400, 'Request body is required');
  
  const body: CreateLayoutRequest = typeof event.body === 'string' 
    ? JSON.parse(event.body) 
    : (event.body as any);

  const { 
    layoutId: providedLayoutId,
    version: providedVersion, 
    jsxCode, 
    name, 
    description, 
    category,
    bucketName = 'gb-email-layouts-900546257868-us-west-1',
    region = 'us-west-1'
  } = body;

  if (!name) throw new HttpError(400, 'name is required');
  if (!jsxCode) throw new HttpError(400, 'jsxCode is required');
  if (!category) throw new HttpError(400, 'category is required');

  // Validate category
  const validCategories = ['newsletters', 'promotional', 'transactional'];
  if (!validCategories.includes(category)) {
    throw new HttpError(400, `category must be one of: ${validCategories.join(', ')}`);
  }

  const s3Client = new S3Client({ region });
  
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

    // Determine layout ID
    let layoutId = providedLayoutId;
    let isFirstVersion = true;
    
    if (layoutId) {
      // Check if layout exists
      const existingLayoutQuery = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `LAYOUT#${layoutId}`
        }
      }));
      
      isFirstVersion = !existingLayoutQuery.Items || existingLayoutQuery.Items.length === 0;
    } else {
      // Generate new layout ID based on name only (no category)
      layoutId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    }

    // Determine version
    let version = providedVersion;
    
    if (!version) {
      if (isFirstVersion) {
        version = 'v1.0.0';
      } else {
        // Get existing versions to determine next version
        const existingVersionsQuery = await docClient.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `LAYOUT#${layoutId}`
          }
        }));
        
        const existingVersions = existingVersionsQuery.Items?.map(item => item.version).filter(v => v !== 'latest') || [];
        version = getNextVersion(existingVersions);
      }
    }

    // Create S3 key using the specified directory structure:
    // gb-email-layouts-900546257868-us-west-1/
    // ├── {layoutId}/
    // │   ├── {version}/          # e.g., v1.0.0/
    // │   │   └── {layoutId}.jsx
    // │   └── latest/
    // │       └── {layoutId}.jsx
    const s3Key = `${layoutId}/${version}/${layoutId}.jsx`;
    const latestS3Key = `${layoutId}/latest/${layoutId}.jsx`;
    
    // 1. Upload JSX to S3 (versioned)
    const s3Command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: jsxCode,
      ContentType: 'text/javascript',
      Metadata: {
        'layout-id': layoutId,
        'version': version,
        'name': name,
        'description': description || '',
        'category': category,
        'uploaded-at': new Date().toISOString()
      }
    });
    
    await s3Client.send(s3Command);
    console.log(`Uploaded JSX to S3: ${s3Key}`);
    
    // 2. Upload JSX to S3 (latest)
    const latestS3Command = new PutObjectCommand({
      Bucket: bucketName,
      Key: latestS3Key,
      Body: jsxCode,
      ContentType: 'text/javascript',
      Metadata: {
        'layout-id': layoutId,
        'version': 'latest',
        'name': name,
        'description': description || '',
        'category': category,
        'uploaded-at': new Date().toISOString()
      }
    });
    
    await s3Client.send(latestS3Command);
    console.log(`Uploaded JSX to S3 (latest): ${latestS3Key}`);
    
    // 3. Write metadata to DynamoDB
    const now = new Date().toISOString();
    const dynamoItems = [];
    
    // Primary layout metadata record (versioned)
    dynamoItems.push({
      PK: `LAYOUT#${layoutId}`,
      SK: `VERSION#${version}`,
      layoutId,
      version,
      name,
      description: description || '',
      category,
      s3Path: `${layoutId}/${version}/`,
      s3JsxPath: s3Key,
      isUniversal: true,
      createdAt: now,
      lastModified: now,
      createdBy: 'system'
    });
    
    // Primary layout metadata record (latest)
    dynamoItems.push({
      PK: `LAYOUT#${layoutId}`,
      SK: `VERSION#latest`,
      layoutId,
      version: 'latest',
      name,
      description: description || '',
      category,
      s3Path: `${layoutId}/latest/`,
      s3JsxPath: latestS3Key,
      isUniversal: true,
      createdAt: now,
      lastModified: now,
      createdBy: 'system'
    });
    
    // Category index record (versioned)
    dynamoItems.push({
      PK: `LAYOUT_CATEGORY#${category}`,
      SK: `LAYOUT#${layoutId}#VERSION#${version}`,
      layoutId,
      version,
      category,
      name,
      description: description || '',
      s3Path: `${layoutId}/${version}/`,
      s3JsxPath: s3Key,
      isUniversal: true,
      createdAt: now,
      lastModified: now
    });
    
    // Category index record (latest)
    dynamoItems.push({
      PK: `LAYOUT_CATEGORY#${category}`,
      SK: `LAYOUT#${layoutId}#VERSION#latest`,
      layoutId,
      version: 'latest',
      category,
      name,
      description: description || '',
      s3Path: `${layoutId}/latest/`,
      s3JsxPath: latestS3Key,
      isUniversal: true,
      createdAt: now,
      lastModified: now
    });
    
    // Write all DynamoDB items
    for (const item of dynamoItems) {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      }));
    }
    
    console.log(`Created ${dynamoItems.length} DynamoDB records for layout ${layoutId}`);
    
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
      latestVersionCreated: true, // Always create latest version
      renderedHtml,
      detectedVariables,
    };
  } catch (error) {
    console.error('Error creating layout:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw new HttpError(500, `Failed to create layout: ${error instanceof Error ? error.message : String(error)}`);
  }
  } catch (outerError) {
    console.error('Outer error in create layout:', outerError);
    console.error('Outer error details:', JSON.stringify(outerError, null, 2));
    
    if (outerError instanceof HttpError) {
      throw outerError;
    }
    
    throw new HttpError(500, `Create layout failed: ${outerError instanceof Error ? outerError.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);