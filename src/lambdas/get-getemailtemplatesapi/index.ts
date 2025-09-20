import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface EmailTemplate {
  templateId: string;
  version: number;
  name: string;
  category: string;
  s3Path: string;
  createdAt: string;
  isActive: boolean;
  description?: string;
}

interface EmailTemplatesResponse {
  templates: EmailTemplate[];
  pagination?: {
    nextToken?: string;
    count: number;
  };
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<EmailTemplatesResponse> => {
  try {
    // Extract query parameters
    const category = event.queryStringParameters?.category;
    const status = event.queryStringParameters?.status || 'ACTIVE';
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 50;
    const nextToken = event.queryStringParameters?.nextToken;

    let queryParams: any;

    // Query by category if specified
    if (category) {
      queryParams = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `TEMPLATE_CATEGORY#${category}`,
          ':sk': 'TEMPLATE#'
        },
        Limit: limit
      };
    } else {
      // Query by status (default: ACTIVE templates)
      queryParams = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `TEMPLATE_STATUS#${status}`,
          ':sk': 'TEMPLATE#'
        },
        Limit: limit
      };
    }

    // Add pagination token if provided
    if (nextToken) {
      queryParams.ExclusiveStartKey = JSON.parse(decodeURIComponent(nextToken));
    }

    const result = await docClient.send(new QueryCommand(queryParams));

    const templates: EmailTemplate[] = (result.Items || []).map(item => ({
      templateId: item.templateId,
      version: item.version,
      name: item.name,
      category: item.category,
      s3Path: item.s3Path,
      createdAt: item.createdAt,
      isActive: item.isActive,
      description: item.description
    }));

    const response: EmailTemplatesResponse = {
      templates,
      pagination: {
        count: templates.length
      }
    };

    // Add nextToken if there are more results
    if (result.LastEvaluatedKey) {
      response.pagination!.nextToken = encodeURIComponent(JSON.stringify(result.LastEvaluatedKey));
    }

    return response;

  } catch (error) {
    console.error('Error fetching email templates:', error);
    throw new Error(`Failed to fetch email templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
