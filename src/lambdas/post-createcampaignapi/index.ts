import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAMES = {
  EMAIL_CAMPAIGNS: process.env.EMAIL_CAMPAIGNS_TABLE_NAME || 'email-campaigns'
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

    const item = {
      userId,
      campaignId,
      name: body.name,
      description: body.description,
      templateId: body.templateId,
      templateVersion: body.templateVersion ?? 1,
      audienceSelection: body.audienceSelection,
      status: body.status ?? 'draft',
      scheduledAt: body.scheduledAt,
      createdAt: nowIso,
      lastModified: nowIso,
      metadata: body.metadata ?? {}
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAMES.EMAIL_CAMPAIGNS,
      Item: item,
      ConditionExpression: 'attribute_not_exists(#userId) AND attribute_not_exists(#campaignId)',
      ExpressionAttributeNames: {
        '#userId': 'userId',
        '#campaignId': 'campaignId'
      }
    }));

    return { success: true, campaignId, campaign: item, message: 'Campaign created' };
  } catch (error) {
    console.error('Error creating campaign:', error);
    throw new HttpError(500, `Failed to create campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
