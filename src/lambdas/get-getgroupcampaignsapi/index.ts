import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAMES = {
  MAIN_TABLE: process.env.MAIN_TABLE_NAME || 'goodbricks-email-main'
} as const;

interface GetGroupCampaignsRequest {
  cognitoId: string;
  groupId: string;
  limit?: number;
  status?: string;
}

interface CampaignItem {
  userId: string;
  campaignId: string;
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
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledAt?: string;
  sentAt?: string;
  createdAt?: string;
  lastModified: string;
  metadata: {
    subject?: string;
    fromName?: string;
    fromEmail?: string;
    previewText?: string;
  };
}

interface GroupCampaignsResponse {
  success: boolean;
  campaigns: CampaignItem[];
  groupId: string;
  totalCount: number;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<GroupCampaignsResponse> => {
  try {
    // Parse request body to get cognitoId, groupId, limit, and status
    const body = event.body ? JSON.parse(event.body) : {};
    const cognitoId = body.cognitoId;
    const groupId = body.groupId;
    const limit = body.limit || 20;
    const status = body.status;
    
    if (!cognitoId) {
      throw new HttpError(400, 'cognitoId is required in request body');
    }
    
    if (!groupId) {
      throw new HttpError(400, 'groupId is required in request body');
    }

    console.log(`Getting campaigns for group: ${groupId} (user: ${cognitoId})`);

    // Build query parameters using new PK/SK pattern
    let queryParams: any = {
      TableName: TABLE_NAMES.MAIN_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${cognitoId}#GROUP#${groupId}`,
        ':sk': 'CAMPAIGN'
      },
      Limit: limit,
      ScanIndexForward: false // Sort by SK descending (newest first)
    };

    // Add status filter if provided
    if (status) {
      queryParams.FilterExpression = '#status = :status';
      queryParams.ExpressionAttributeNames = {
        '#status': 'status'
      };
      queryParams.ExpressionAttributeValues[':status'] = status;
    }

    const result = await docClient.send(new QueryCommand(queryParams));

    // Transform the results to match the expected format
    const campaigns: CampaignItem[] = (result.Items || []).map(item => ({
      userId: item.userId,
      campaignId: item.campaignId,
      name: item.name,
      description: item.description,
      templateId: item.templateId,
      templateVersion: item.templateVersion,
      audienceSelection: item.audienceSelection,
      recipients: item.recipients,
      status: item.status,
      scheduledAt: item.scheduledAt,
      sentAt: item.sentAt,
      createdAt: item.createdAt,
      lastModified: item.lastModified,
      metadata: item.metadata || {}
    }));

    console.log(`Found ${campaigns.length} campaigns for group: ${groupId}`);

    return {
      success: true,
      campaigns,
      groupId,
      totalCount: campaigns.length,
      message: `Found ${campaigns.length} campaigns for group: ${groupId}`
    };

  } catch (error) {
    console.error('Error getting group campaigns:', error);
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to get group campaigns: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
