import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

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

    const lastModified = new Date().toISOString();

    // Build update expression dynamically
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

    // Update main campaign record
    const updateCommand = new UpdateCommand({
      TableName: TABLE_NAME,
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
      return {
        success: false,
        message: 'Campaign not found or update failed'
      };
    }

    // If status is being updated, also update the status index
    if (updates.status !== undefined) {
      const statusUpdateCommand = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `CAMPAIGN_STATUS#${updates.status}`,
          SK: `USER#${userId}#CAMPAIGN#${campaignId}`
        },
        UpdateExpression: 'SET #status = :status, #lastModified = :lastModified, #name = :name',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#lastModified': 'lastModified',
          '#name': 'name'
        },
        ExpressionAttributeValues: {
          ':status': updates.status,
          ':lastModified': lastModified,
          ':name': updates.name || result.Attributes.name
        },
        ReturnValues: 'ALL_NEW'
      });

      await docClient.send(statusUpdateCommand);
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
