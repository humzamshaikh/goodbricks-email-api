import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-1'
});

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'gb-email-layouts-900546257868-us-west-1';

interface GetTemplatesRequest {
  cognitoId: string;
}

interface EmailTemplate {
  templateId: string;
  name: string;
  description?: string;
  category?: string;
  version: string;
  s3Path: string;
  s3Key: string;
  createdAt: string;
  lastModified: string;
  variables: string[];
  isLatest: boolean;
  organization?: string;
}

interface EmailTemplatesResponse {
  success: boolean;
  templates: EmailTemplate[];
  totalCount: number;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<EmailTemplatesResponse> => {
  try {
    // Parse request body to get cognitoId
    const body = event.body ? JSON.parse(event.body) : {};
    const cognitoId = body.cognitoId;
    
    if (!cognitoId) {
      throw new Error('cognitoId is required in request body');
    }

    console.log(`Getting email templates for user: ${cognitoId}`);

    // Query all layouts for this user from DynamoDB
    const queryParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${cognitoId}`,
        ':sk': 'LAYOUT'
      }
    };

    const result = await docClient.send(new QueryCommand(queryParams));
    console.log(`Found ${result.Items?.length || 0} layout records in DynamoDB`);

    // Get all S3 objects to find available layouts
    const s3Params = {
      Bucket: BUCKET_NAME,
      Prefix: 'universal/',
      Delimiter: '/'
    };

    const s3Result = await s3Client.send(new ListObjectsV2Command(s3Params));
    console.log(`Found ${s3Result.CommonPrefixes?.length || 0} layout folders in S3`);

    // Extract template IDs from S3 prefixes
    const s3TemplateIds = s3Result.CommonPrefixes?.map(prefix => 
      prefix.Prefix?.replace('universal/', '').replace('/', '')
    ).filter(Boolean) || [];

    console.log(`S3 Template IDs: ${s3TemplateIds.join(', ')}`);

    // Build templates array combining DynamoDB metadata with S3 availability
    const templates: EmailTemplate[] = [];

    // Process DynamoDB records
    for (const item of result.Items || []) {
      const templateId = item.templateId;
      const isInS3 = s3TemplateIds.includes(templateId);
      
      if (isInS3) {
        templates.push({
          templateId: item.templateId,
          name: item.name,
          description: item.description,
          category: item.category,
          version: item.version || 'latest',
          s3Path: `s3://${BUCKET_NAME}/universal/${templateId}/latest/component.jsx`,
          s3Key: `universal/${templateId}/latest/component.jsx`,
          createdAt: item.created,
          lastModified: item.lastModified,
          variables: item.variables || [],
          isLatest: true,
          organization: item.organization
        });
      }
    }

    // Add any S3 templates that don't have DynamoDB records (orphaned)
    for (const templateId of s3TemplateIds) {
      const hasDynamoRecord = result.Items?.some(item => item.templateId === templateId);
      if (!hasDynamoRecord) {
        templates.push({
          templateId: templateId || 'unknown',
          name: templateId || 'unknown',
          description: 'Layout found in S3 but no metadata in DynamoDB',
          category: 'unknown',
          version: 'latest',
          s3Path: `s3://${BUCKET_NAME}/universal/${templateId}/latest/component.jsx`,
          s3Key: `universal/${templateId}/latest/component.jsx`,
          createdAt: 'Unknown',
          lastModified: 'Unknown',
          variables: [],
          isLatest: true,
          organization: 'Unknown'
        });
      }
    }

    console.log(`Returning ${templates.length} templates`);

    return {
      success: true,
      templates,
      totalCount: templates.length,
      message: `Found ${templates.length} email templates`
    };

  } catch (error) {
    console.error('Error fetching email templates:', error);
    throw new Error(`Failed to fetch email templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
