import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface GetGroupMetadataRequest {
  cognitoId: string;
}

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
  success: boolean;
  groups: GroupMetadata[];
  totalCount: number;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<GroupMetadataResponse> => {
  try {
    // Parse request body to get cognitoId
    const body = event.body ? JSON.parse(event.body) : {};
    const cognitoId = body.cognitoId;
    
    if (!cognitoId) {
      throw new Error('cognitoId is required in request body');
    }

    console.log(`Getting group metadata for user: ${cognitoId}`);

    let queryParams: any = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${cognitoId}`,
        ':sk': 'GROUPMETADATA'
      }
    };

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

    console.log(`Found ${groups.length} groups for user: ${cognitoId}`);

    return {
      success: true,
      groups,
      totalCount: groups.length,
      message: `Found ${groups.length} groups for user: ${cognitoId}`
    };

  } catch (error) {
    console.error('Error fetching group metadata:', error);
    throw new Error(`Failed to fetch group metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
