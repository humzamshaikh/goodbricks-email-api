import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface GetAudienceRequest {
  cognitoId: string;
}

interface AudienceMember {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  tags: string[];
  lastModified: string;
}

interface AudienceResponse {
  audience: AudienceMember[];
  pagination?: {
    nextToken?: string;
    count: number;
  };
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<AudienceResponse> => {
  try {
    // Parse request body to get cognitoId
    const body = event.body ? JSON.parse(event.body) : {};
    const cognitoId = body.cognitoId;
    
    if (!cognitoId) {
      throw new Error('cognitoId is required in request body');
    }

    // Extract query parameters
    const tag = event.queryStringParameters?.tag;
    const status = event.queryStringParameters?.status;
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 50;
    const nextToken = event.queryStringParameters?.nextToken;

    let queryParams: any = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${cognitoId}`,
        ':sk': 'AUDIENCE'
      },
      Limit: limit
    };

    // Add pagination token if provided
    if (nextToken) {
      queryParams.ExclusiveStartKey = JSON.parse(decodeURIComponent(nextToken));
    }

    // If filtering by tag, add filter expression
    if (tag) {
      queryParams.FilterExpression = 'contains(tags, :tag)';
      queryParams.ExpressionAttributeValues[':tag'] = tag;
    }

    // If filtering by status, add filter expression
    if (status) {
      const existingFilter = queryParams.FilterExpression;
      const statusFilter = 'contains(tags, :status)';
      queryParams.FilterExpression = existingFilter 
        ? `${existingFilter} AND ${statusFilter}`
        : statusFilter;
      queryParams.ExpressionAttributeValues[':status'] = status;
    }

    const result = await docClient.send(new QueryCommand(queryParams));

    const audience: AudienceMember[] = (result.Items || []).map(item => ({
      userId: item.userId,
      email: item.email,
      firstName: item.firstName,
      lastName: item.lastName,
      tags: item.tags || [],
      lastModified: item.lastModified
    }));

    const response: AudienceResponse = {
      audience,
      pagination: {
        count: audience.length
      }
    };

    // Add nextToken if there are more results
    if (result.LastEvaluatedKey) {
      response.pagination!.nextToken = encodeURIComponent(JSON.stringify(result.LastEvaluatedKey));
    }

    return response;

  } catch (error) {
    console.error('Error fetching audience:', error);
    throw new Error(`Failed to fetch audience: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
