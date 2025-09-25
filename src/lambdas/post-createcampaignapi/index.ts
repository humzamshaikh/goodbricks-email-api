
import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
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

interface CreateCampaignRequest {
  name: string;
  description?: string;
  templateId: string;
  templateVersion?: number;
  audienceSelection: {
    type: 'tag' | 'list' | 'all';
    values: string[];
  };
  recipients?: {
    type: 'groups' | 'all_audience';
    groupIds?: string[];
  };
  status?: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledAt?: string; // ISO
  metadata?: {
    subject?: string;
    fromName?: string;
    fromEmail?: string;
    previewText?: string;
  };
}

interface CreateCampaignResponse {
  success: boolean;
  campaignId?: string;
  campaign?: any;
  message?: string;
  indexesCreated?: number;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<CreateCampaignResponse> => {
  const userId = event.pathParameters?.userId || (event.body ? JSON.parse(event.body).userId : undefined);
  if (!userId) {
    throw new HttpError(400, 'userId is required');
  }

  const body = event.body ? JSON.parse(event.body) as CreateCampaignRequest : undefined;
  if (!body || !body.name || !body.templateId || !body.audienceSelection) {
    throw new HttpError(400, 'name, templateId, and audienceSelection are required');
  }

  try {
    const nowIso = new Date().toISOString();
    const campaignId = `cmp-${randomUUID().slice(0, 8)}`;

    // Determine recipients based on audienceSelection
    let recipients: { type: 'groups' | 'all_audience'; groupIds?: string[] } = {
      type: 'all_audience'
    };

    if (body.recipients) {
      recipients = body.recipients;
    } else if (body.audienceSelection.type === 'tag') {
      // Map tags to group IDs (assuming tags are group IDs)
      recipients = {
        type: 'groups',
        groupIds: body.audienceSelection.values
      };
    } else if (body.audienceSelection.type === 'list') {
      // For list-based campaigns, we'll store as all_audience since it's a specific list
      recipients = {
        type: 'all_audience'
      };
    }

    const status = body.status ?? 'draft';
    const item = {
      userId,
      campaignId,
      name: body.name,
      description: body.description,
      templateId: body.templateId,
      templateVersion: body.templateVersion ?? 1,
      audienceSelection: body.audienceSelection,
      recipients: recipients,
      status: status,
      scheduledAt: body.scheduledAt,
      createdAt: nowIso,
      lastModified: nowIso,
      metadata: body.metadata ?? {}
    };

    // Create main campaign record in the main table
    const mainCampaignRecord = {
      PK: `USER#${userId}`,
      SK: `CAMPAIGN#${campaignId}`,
      ...item
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAMES.MAIN_TABLE,
      Item: mainCampaignRecord,
      ConditionExpression: 'attribute_not_exists(#PK) AND attribute_not_exists(#SK)',
      ExpressionAttributeNames: {
        '#PK': 'PK',
        '#SK': 'SK'
      }
    }));

    // Create index records in the main table for efficient querying
    const indexRecords = [
      // 1. Organization Campaigns Index - All campaigns for an org
      {
        PK: `ORG_CAMPAIGNS#${userId}`,
        SK: `CAMPAIGN#${campaignId}`,
        userId: userId,
        campaignId: campaignId,
        name: body.name,
        description: body.description,
        templateId: body.templateId,
        templateVersion: body.templateVersion ?? 1,
        audienceSelection: body.audienceSelection,
        recipients: recipients,
        status: status,
        scheduledAt: body.scheduledAt,
        createdAt: nowIso,
        lastModified: nowIso,
        metadata: body.metadata ?? {}
      },
      // 2. Organization Status Campaigns Index - Campaigns by org and status
      {
        PK: `ORG_STATUS_CAMPAIGNS#${userId}#${status}`,
        SK: `CAMPAIGN#${campaignId}`,
        userId: userId,
        campaignId: campaignId,
        name: body.name,
        description: body.description,
        templateId: body.templateId,
        templateVersion: body.templateVersion ?? 1,
        audienceSelection: body.audienceSelection,
        recipients: recipients,
        status: status,
        scheduledAt: body.scheduledAt,
        createdAt: nowIso,
        lastModified: nowIso,
        metadata: body.metadata ?? {}
      }
    ];

    // Add group-specific index records if recipients are group-based
    if (recipients.type === 'groups' && recipients.groupIds) {
      recipients.groupIds.forEach(groupId => {
        indexRecords.push({
          PK: `GROUP_CAMPAIGNS#${userId}#${groupId}`,
          SK: `CAMPAIGN#${campaignId}`,
          userId: userId,
          campaignId: campaignId,
          groupId: groupId,
          name: body.name,
          description: body.description,
          templateId: body.templateId,
          templateVersion: body.templateVersion ?? 1,
          audienceSelection: body.audienceSelection,
          recipients: recipients,
          status: status,
          scheduledAt: body.scheduledAt,
          createdAt: nowIso,
          lastModified: nowIso,
          metadata: body.metadata ?? {}
        } as any); // Type assertion to handle the groupId property
      });
    }

    // Add audience member index records for all audience members
    // This will be populated when the campaign is sent, but we can create the structure here
    // For now, we'll create a placeholder that gets updated during send
    if (recipients.type === 'all_audience') {
      // Create a marker record that indicates this campaign targets all audience
      indexRecords.push({
        PK: `ALL_AUDIENCE_CAMPAIGNS#${userId}`,
        SK: `CAMPAIGN#${campaignId}`,
        userId: userId,
        campaignId: campaignId,
        name: body.name,
        description: body.description,
        templateId: body.templateId,
        templateVersion: body.templateVersion ?? 1,
        audienceSelection: body.audienceSelection,
        recipients: recipients,
        status: status,
        scheduledAt: body.scheduledAt,
        createdAt: nowIso,
        lastModified: nowIso,
        metadata: body.metadata ?? {}
      } as any);
    }

    // Create all index records using batch write
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
      campaignId, 
      campaign: mainCampaignRecord, 
      message: 'Campaign created with all index records in main table',
      indexesCreated: indexRecords.length + 1 // +1 for the main campaign record
    };
  } catch (error) {
    console.error('Error creating campaign:', error);
    throw new HttpError(500, `Failed to create campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
