import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface GroupAudienceMember {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  tags: string[];
  organization: string;
  entityType: string;
  createdAt: string;
  lastModified: string;
}

interface GroupAudienceResponse {
  groupId: string;
  audience: GroupAudienceMember[];
  pagination?: {
    nextToken?: string;
    count: number;
  };
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<GroupAudienceResponse> => {
  try {
    const userId = event.pathParameters?.userId || event.queryStringParameters?.userId;
    const groupId = event.pathParameters?.groupId || event.queryStringParameters?.groupId;
    
    if (!userId) {
      throw new Error('userId is required');
    }

    if (!groupId) {
      throw new Error('groupId is required');
    }

    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 50;
    const nextToken = event.queryStringParameters?.nextToken;

    let queryParams: any = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}#GROUP#${groupId}`,
        ':sk': 'AUDIENCE#'
      },
      Limit: limit
    };

    // Add pagination token if provided
    if (nextToken) {
      queryParams.ExclusiveStartKey = JSON.parse(decodeURIComponent(nextToken));
    }

    const result = await docClient.send(new QueryCommand(queryParams));

    const audience: GroupAudienceMember[] = (result.Items || []).map(item => ({
      userId: item.userId,
      email: item.email,
      firstName: item.firstName,
      lastName: item.lastName,
      tags: item.tags || [],
      organization: item.organization || '',
      entityType: item.entityType || 'AUDIENCE',
      createdAt: item.createdAt,
      lastModified: item.lastModified
    }));

    const response: GroupAudienceResponse = {
      groupId: groupId,
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
    console.error('Error fetching group audience:', error);
    throw new Error(`Failed to fetch group audience: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
