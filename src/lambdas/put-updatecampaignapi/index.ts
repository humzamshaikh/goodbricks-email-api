import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAMES = {
  EMAIL_CAMPAIGNS: process.env.EMAIL_CAMPAIGNS_TABLE_NAME || 'email-campaigns',
  MAIN_TABLE: process.env.MAIN_TABLE_NAME || 'goodbricks-email-main'
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
  recipients?: {
    type: 'groups' | 'all_audience';
    groupIds?: string[];
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
      throw new HttpError(400, 'userId is required');
    }
    if (!campaignId) {
      throw new HttpError(400, 'campaignId is required');
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const updates: UpdateCampaignRequest = body;

    if (Object.keys(updates).length === 0) {
      throw new HttpError(400, 'No update fields provided');
    }

    const lastModified = new Date().toISOString();

    // First, get the current campaign to understand what we're updating
    const currentCampaign = await docClient.send(new GetCommand({
      TableName: TABLE_NAMES.MAIN_TABLE,
      Key: {
        PK: `USER#${userId}`,
        SK: `CAMPAIGN#${campaignId}`
      }
    }));

    if (!currentCampaign.Item) {
      throw new HttpError(404, 'Campaign not found');
    }

    const currentStatus = currentCampaign.Item.status;
    const newStatus = updates.status || currentStatus;

    // Build update expression dynamically for email-campaigns table
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Always update lastModified
    updateExpressions.push('#lastModified = :lastModified');
    expressionAttributeNames['#lastModified'] = 'lastModified';
    expressionAttributeValues[':lastModified'] = lastModified;

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

    if (updates.recipients !== undefined) {
      updateExpressions.push('#recipients = :recipients');
      expressionAttributeNames['#recipients'] = 'recipients';
      expressionAttributeValues[':recipients'] = updates.recipients;
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

    // Update main campaign record in main table
    const updateCommand = new UpdateCommand({
      TableName: TABLE_NAMES.MAIN_TABLE,
      Key: {
        PK: `USER#${userId}`,
        SK: `CAMPAIGN#${campaignId}`
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    });

    const result = await docClient.send(updateCommand);

    if (!result.Attributes) {
      throw new HttpError(500, 'Campaign update failed');
    }

    // Update index records in main table
    const updatedCampaign = result.Attributes;
    const indexRecords = [
      // Update organization campaigns index
      {
        PK: `ORG_CAMPAIGNS#${userId}`,
        SK: `CAMPAIGN#${campaignId}`,
        userId: userId,
        campaignId: campaignId,
        name: updatedCampaign.name,
        description: updatedCampaign.description,
        templateId: updatedCampaign.templateId,
        templateVersion: updatedCampaign.templateVersion,
        audienceSelection: updatedCampaign.audienceSelection,
        recipients: updatedCampaign.recipients,
        status: newStatus,
        scheduledAt: updatedCampaign.scheduledAt,
        sentAt: updatedCampaign.sentAt,
        createdAt: updatedCampaign.createdAt,
        lastModified: lastModified,
        metadata: updatedCampaign.metadata
      },
      // Update organization status campaigns index
      {
        PK: `ORG_STATUS_CAMPAIGNS#${userId}#${newStatus}`,
        SK: `CAMPAIGN#${campaignId}`,
        userId: userId,
        campaignId: campaignId,
        name: updatedCampaign.name,
        description: updatedCampaign.description,
        templateId: updatedCampaign.templateId,
        templateVersion: updatedCampaign.templateVersion,
        audienceSelection: updatedCampaign.audienceSelection,
        recipients: updatedCampaign.recipients,
        status: newStatus,
        scheduledAt: updatedCampaign.scheduledAt,
        sentAt: updatedCampaign.sentAt,
        createdAt: updatedCampaign.createdAt,
        lastModified: lastModified,
        metadata: updatedCampaign.metadata
      }
    ];

    // Add group-specific updates if recipients are group-based
    if (updatedCampaign.recipients?.type === 'groups' && updatedCampaign.recipients.groupIds) {
      updatedCampaign.recipients.groupIds.forEach(groupId => {
        indexRecords.push({
          PK: `GROUP_CAMPAIGNS#${userId}#${groupId}`,
          SK: `CAMPAIGN#${campaignId}`,
          userId: userId,
          campaignId: campaignId,
          groupId: groupId,
          name: updatedCampaign.name,
          description: updatedCampaign.description,
          templateId: updatedCampaign.templateId,
          templateVersion: updatedCampaign.templateVersion,
          audienceSelection: updatedCampaign.audienceSelection,
          recipients: updatedCampaign.recipients,
          status: newStatus,
          scheduledAt: updatedCampaign.scheduledAt,
          sentAt: updatedCampaign.sentAt,
          createdAt: updatedCampaign.createdAt,
          lastModified: lastModified,
          metadata: updatedCampaign.metadata
        });
      });
    }

    // Batch write all updates to main table
    const batchRequests = indexRecords.map(record => ({
      PutRequest: {
        Item: record
      }
    }));

    // Process in batches of 25 (DynamoDB limit)
    for (let i = 0; i < batchRequests.length; i += 25) {
      const batch = batchRequests.slice(i, i + 25);
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAMES.MAIN_TABLE]: batch
        }
      }));
    }

    return {
      success: true,
      campaign: updatedCampaign,
      message: 'Campaign updated successfully'
    };

  } catch (error) {
    console.error('Error updating campaign:', error);
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to update campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
