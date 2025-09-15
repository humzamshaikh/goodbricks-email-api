import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-2'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Table names
const TABLE_NAMES = {
  AUDIENCE: process.env.AUDIENCE_TABLE_NAME || 'audience'
} as const;

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
    // Extract userId from path parameters or query parameters
    const userId = event.pathParameters?.userId || event.queryStringParameters?.userId;
    
    if (!userId) {
      throw new Error('userId is required');
    }

    // Extract query parameters
    const tag = event.queryStringParameters?.tag;
    const status = event.queryStringParameters?.status;
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 50;
    const nextToken = event.queryStringParameters?.nextToken;

    let queryParams: any = {
      TableName: TABLE_NAMES.AUDIENCE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
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
