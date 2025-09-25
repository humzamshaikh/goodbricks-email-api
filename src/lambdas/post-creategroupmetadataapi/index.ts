import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface CreateGroupMetadataRequest {
  userId: string; // Cognito user ID
  groupId: string; // Group identifier (e.g., "vip-members", "newsletter-subscribers")
  groupName: string; // Display name for the group
  description?: string; // Optional description
  memberCount: number; // Number of members in the group
  totalCampaignsSent?: number; // Total campaigns sent to this group (default: 0)
  lastCampaignSent?: string; // ISO date of last campaign sent
  averageOpenRate?: number; // Average open rate (0.0 to 1.0)
  averageClickRate?: number; // Average click rate (0.0 to 1.0)
  isActive?: boolean; // Whether the group is active (default: true)
}

interface CreateGroupMetadataResponse {
  success: boolean;
  groupId?: string;
  group?: any;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<CreateGroupMetadataResponse> => {
  const body = event.body ? JSON.parse(event.body) as CreateGroupMetadataRequest : undefined;
  
  if (!body) {
    throw new HttpError(400, 'Request body is required');
  }

  // Validate required fields
  if (!body.userId || typeof body.userId !== 'string') {
    throw new HttpError(400, 'userId is required and must be a string');
  }

  if (!body.groupId || typeof body.groupId !== 'string') {
    throw new HttpError(400, 'groupId is required and must be a string');
  }

  if (!body.groupName || typeof body.groupName !== 'string') {
    throw new HttpError(400, 'groupName is required and must be a string');
  }

  if (typeof body.memberCount !== 'number' || body.memberCount < 0) {
    throw new HttpError(400, 'memberCount is required and must be a non-negative number');
  }

  try {
    const nowIso = new Date().toISOString();
    
    // Create the group metadata item
    const groupItem = {
      PK: `USER#${body.userId}`,
      SK: `GROUPMETADATA#${body.groupId}`,
      userId: body.userId,
      groupId: body.groupId,
      groupName: body.groupName,
      description: body.description || '',
      memberCount: body.memberCount,
      totalCampaignsSent: body.totalCampaignsSent || 0,
      lastCampaignSent: body.lastCampaignSent || '',
      averageOpenRate: body.averageOpenRate || 0,
      averageClickRate: body.averageClickRate || 0,
      isActive: body.isActive !== undefined ? body.isActive : true,
      createdAt: nowIso,
      lastModified: nowIso
    };

    // Put the group metadata into DynamoDB
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: groupItem,
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    }));

    return { 
      success: true, 
      groupId: body.groupId,
      group: groupItem,
      message: 'Group metadata created successfully' 
    };

  } catch (error) {
    console.error('Error creating group metadata:', error);
    
    // Handle conditional check failure (group metadata already exists)
    if (error instanceof Error && error.message.includes('ConditionalCheckFailedException')) {
      throw new HttpError(409, `Group metadata already exists for user: ${body.userId} and group: ${body.groupId}`);
    }

    throw new HttpError(500, `Failed to create group metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
