import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface GetGroupAudienceRequest {
  cognitoId: string;
  groupId: string;
  limit?: number;
}

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
  success: boolean;
  groupId: string;
  audience: GroupAudienceMember[];
  totalCount: number;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<GroupAudienceResponse> => {
  try {
    // Parse request body to get cognitoId, groupId, and limit
    const body = event.body ? JSON.parse(event.body) : {};
    const cognitoId = body.cognitoId;
    const groupId = body.groupId;
    const limit = body.limit || 50;
    
    if (!cognitoId) {
      throw new Error('cognitoId is required in request body');
    }

    if (!groupId) {
      throw new Error('groupId is required in request body');
    }

    console.log(`Getting audience for group: ${groupId} (user: ${cognitoId})`);

    let queryParams: any = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${cognitoId}#GROUP#${groupId}`,
        ':sk': 'AUDIENCE'
      },
      Limit: limit
    };

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

    console.log(`Found ${audience.length} audience members in group: ${groupId}`);

    return {
      success: true,
      groupId: groupId,
      audience,
      totalCount: audience.length,
      message: `Found ${audience.length} audience members in group: ${groupId}`
    };

  } catch (error) {
    console.error('Error fetching group audience:', error);
    throw new Error(`Failed to fetch group audience: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
