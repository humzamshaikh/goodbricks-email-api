import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients (region us-west-1 by default, can be overridden by env)
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

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

interface AudienceGroupResponse {
  audience: AudienceMember[];
  pagination?: {
    nextToken?: string;
    count: number;
  };
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<AudienceGroupResponse> => {
  // Expect userId and group (tag) provided via path or query
  const userId = event.pathParameters?.userId || event.queryStringParameters?.userId;
  const group = event.pathParameters?.group || event.queryStringParameters?.group || event.queryStringParameters?.tag;
  const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 50;
  const nextToken = event.queryStringParameters?.nextToken;

  if (!userId) throw new Error('userId is required');
  if (!group) throw new Error('group (tag) is required');

  const queryParams: any = {
    TableName: TABLE_NAMES.AUDIENCE,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
      ':group': group
    },
    FilterExpression: 'contains(tags, :group)',
    Limit: limit
  };

  if (nextToken) {
    queryParams.ExclusiveStartKey = JSON.parse(decodeURIComponent(nextToken));
  }

  const result = await docClient.send(new QueryCommand(queryParams));

  const audience: AudienceMember[] = (result.Items || []).map((item: any) => ({
    userId: item.userId,
    email: item.email,
    firstName: item.firstName,
    lastName: item.lastName,
    tags: item.tags || [],
    lastModified: item.lastModified
  }));

  const response: AudienceGroupResponse = {
    audience,
    pagination: { count: audience.length }
  };

  if (result.LastEvaluatedKey) {
    response.pagination!.nextToken = encodeURIComponent(JSON.stringify(result.LastEvaluatedKey));
  }

  return response;
};

export const handler = createHttpHandler(handlerLogic);
