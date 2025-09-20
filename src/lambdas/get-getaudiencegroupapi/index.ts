import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface AudienceGroup {
  groupId: string;
  name: string;
  description?: string;
  createdAt: string;
  lastModified: string;
  memberCount?: number;
}

interface AudienceGroupsResponse {
  groups: AudienceGroup[];
  pagination?: {
    nextToken?: string;
    count: number;
  };
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<AudienceGroupsResponse> => {
  try {
    const userId = event.pathParameters?.userId || event.queryStringParameters?.userId;
    
    if (!userId) {
      throw new Error('userId is required');
    }

    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 50;
    const nextToken = event.queryStringParameters?.nextToken;

    let queryParams: any = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'GROUP#'
      },
      Limit: limit
    };

    // Add pagination token if provided
    if (nextToken) {
      queryParams.ExclusiveStartKey = JSON.parse(decodeURIComponent(nextToken));
    }

    const result = await docClient.send(new QueryCommand(queryParams));

    const groups: AudienceGroup[] = (result.Items || []).map(item => ({
      groupId: item.groupId,
      name: item.name,
      description: item.description,
      createdAt: item.createdAt,
      lastModified: item.lastModified,
      memberCount: item.memberCount
    }));

    // Get member counts for each group
    for (const group of groups) {
      const memberCountResult = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}#GROUP#${group.groupId}`,
          ':sk': 'AUDIENCE#'
        },
        Select: 'COUNT'
      }));
      
      group.memberCount = memberCountResult.Count || 0;
    }

    const response: AudienceGroupsResponse = {
      groups,
      pagination: {
        count: groups.length
      }
    };

    // Add nextToken if there are more results
    if (result.LastEvaluatedKey) {
      response.pagination!.nextToken = encodeURIComponent(JSON.stringify(result.LastEvaluatedKey));
    }

    return response;

  } catch (error) {
    console.error('Error fetching audience groups:', error);
    throw new Error(`Failed to fetch audience groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
