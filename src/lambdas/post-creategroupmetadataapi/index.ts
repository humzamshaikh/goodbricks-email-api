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
  cognitoId: string; // Cognito user ID
  groupName: string; // Display name for the group
  description?: string; // Optional description
  groupId?: string; // Optional group identifier - will be generated if not provided
  isActive?: boolean; // Whether the group is active (default: true)
}

interface CreateGroupMetadataResponse {
  success: boolean;
  groupId?: string;
  groupMetadata?: any;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<CreateGroupMetadataResponse> => {
  const body = event.body ? JSON.parse(event.body) as CreateGroupMetadataRequest : undefined;
  
  if (!body) {
    throw new HttpError(400, 'Request body is required');
  }

  // Validate required fields
  if (!body.cognitoId || typeof body.cognitoId !== 'string') {
    throw new HttpError(400, 'cognitoId is required and must be a string');
  }

  if (!body.groupName || typeof body.groupName !== 'string') {
    throw new HttpError(400, 'groupName is required and must be a string');
  }

  try {
    const nowIso = new Date().toISOString();
    
    // Generate unique groupId if not provided
    const groupId = body.groupId || `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create the group metadata item with specified defaults
    const groupItem = {
      PK: `USER#${body.cognitoId}`,
      SK: `GROUPMETADATA#${groupId}`,
      userId: body.cognitoId,
      groupId: groupId,
      groupName: body.groupName,
      description: body.description || '',
      memberCount: 0, // Initial: 0
      totalCampaignsSent: 0, // Initial: 0
      lastCampaignSent: null, // Initial: null
      averageOpenRate: 0, // Initial: 0
      averageClickRate: 0, // Initial: 0
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
      groupId: groupId,
      groupMetadata: groupItem,
      message: 'Group metadata created successfully' 
    };

  } catch (error) {
    console.error('Error creating group metadata:', error);
    
    // Handle conditional check failure (group metadata already exists)
    if (error instanceof Error && error.message.includes('ConditionalCheckFailedException')) {
      const groupId = body.groupId || 'generated';
      throw new HttpError(409, `Group metadata already exists for user: ${body.cognitoId} and group: ${groupId}`);
    }

    throw new HttpError(500, `Failed to create group metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
