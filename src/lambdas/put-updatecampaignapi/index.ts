import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAMES = {
  EMAIL_CAMPAIGNS: process.env.EMAIL_CAMPAIGNS_TABLE_NAME || 'email-campaigns'
} as const;

interface UpdateCampaignRequest {
  name?: string;
  description?: string;
  templateId?: string;
  templateVersion?: number;
  audienceSelection?: {
    type: 'tag' | 'list' | 'all';
    values: string[];
  };
  status?: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledAt?: string | null; // ISO string or null to remove
  metadata?: {
    subject?: string;
    fromName?: string;
    fromEmail?: string;
    previewText?: string;
  };
}

interface UpdateCampaignResponse {
  success: boolean;
  campaign?: any;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<UpdateCampaignResponse> => {
  try {
    const userId = event.pathParameters?.userId;
    const campaignId = event.pathParameters?.campaignId;

    if (!userId) {
      throw new Error('userId is required');
    }
    if (!campaignId) {
      throw new Error('campaignId is required');
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const updates: UpdateCampaignRequest = body;

    if (Object.keys(updates).length === 0) {
      throw new Error('No update fields provided');
    }

    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Always update lastModified
    updateExpressions.push('#lastModified = :lastModified');
    expressionAttributeNames['#lastModified'] = 'lastModified';
    expressionAttributeValues[':lastModified'] = new Date().toISOString();

    // Handle each update field
    if (updates.name !== undefined) {
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = updates.name;
    }

    if (updates.description !== undefined) {
      updateExpressions.push('#description = :description');
      expressionAttributeNames['#description'] = 'description';
      expressionAttributeValues[':description'] = updates.description;
    }

    if (updates.templateId !== undefined) {
      updateExpressions.push('#templateId = :templateId');
      expressionAttributeNames['#templateId'] = 'templateId';
      expressionAttributeValues[':templateId'] = updates.templateId;
    }

    if (updates.templateVersion !== undefined) {
      updateExpressions.push('#templateVersion = :templateVersion');
      expressionAttributeNames['#templateVersion'] = 'templateVersion';
      expressionAttributeValues[':templateVersion'] = updates.templateVersion;
    }

    if (updates.audienceSelection !== undefined) {
      updateExpressions.push('#audienceSelection = :audienceSelection');
      expressionAttributeNames['#audienceSelection'] = 'audienceSelection';
      expressionAttributeValues[':audienceSelection'] = updates.audienceSelection;
    }

    if (updates.status !== undefined) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = updates.status;
    }

    if (updates.scheduledAt !== undefined) {
      if (updates.scheduledAt === null) {
        // Remove scheduledAt attribute
        updateExpressions.push('REMOVE #scheduledAt');
        expressionAttributeNames['#scheduledAt'] = 'scheduledAt';
      } else {
        updateExpressions.push('#scheduledAt = :scheduledAt');
        expressionAttributeNames['#scheduledAt'] = 'scheduledAt';
        expressionAttributeValues[':scheduledAt'] = updates.scheduledAt;
      }
    }

    if (updates.metadata !== undefined) {
      updateExpressions.push('#metadata = :metadata');
      expressionAttributeNames['#metadata'] = 'metadata';
      expressionAttributeValues[':metadata'] = updates.metadata;
    }

    const updateCommand = new UpdateCommand({
      TableName: TABLE_NAMES.EMAIL_CAMPAIGNS,
      Key: {
        userId: userId,
        campaignId: campaignId
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    });

    const result = await docClient.send(updateCommand);

    if (!result.Attributes) {
      return {
        success: false,
        message: 'Campaign not found or update failed'
      };
    }

    return {
      success: true,
      campaign: result.Attributes,
      message: 'Campaign updated successfully'
    };

  } catch (error) {
    console.error('Error updating campaign:', error);
    throw new Error(`Failed to update campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
