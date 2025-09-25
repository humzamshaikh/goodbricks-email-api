import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface GroupMetadata {
  userId: string;
  groupId: string;
  groupName: string;
  description?: string;
  memberCount: number;
  totalCampaignsSent: number;
  lastCampaignSent?: string;
  averageOpenRate: number;
  averageClickRate: number;
  isActive: boolean;
  createdAt: string;
  lastModified: string;
}

interface GroupMetadataResponse {
  groups: GroupMetadata[];
  pagination?: {
    nextToken?: string;
    count: number;
  };
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<GroupMetadataResponse> => {
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
        ':sk': 'GROUPMETADATA#'
      },
      Limit: limit
    };

    // Add pagination token if provided
    if (nextToken) {
      queryParams.ExclusiveStartKey = JSON.parse(decodeURIComponent(nextToken));
    }

    const result = await docClient.send(new QueryCommand(queryParams));

    const groups: GroupMetadata[] = (result.Items || []).map(item => ({
      userId: item.userId,
      groupId: item.groupId,
      groupName: item.groupName,
      description: item.description || '',
      memberCount: item.memberCount || 0,
      totalCampaignsSent: item.totalCampaignsSent || 0,
      lastCampaignSent: item.lastCampaignSent || '',
      averageOpenRate: item.averageOpenRate || 0,
      averageClickRate: item.averageClickRate || 0,
      isActive: item.isActive !== undefined ? item.isActive : true,
      createdAt: item.createdAt,
      lastModified: item.lastModified
    }));

    const response: GroupMetadataResponse = {
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
    console.error('Error fetching group metadata:', error);
    throw new Error(`Failed to fetch group metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
