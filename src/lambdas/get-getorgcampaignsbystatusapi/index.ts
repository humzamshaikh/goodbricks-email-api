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

interface GetOrgCampaignsByStatusRequest {
  cognitoId: string;
  status: string;
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

interface OrgStatusCampaignsResponse {
  success: boolean;
  campaigns: CampaignItem[];
  status: string;
  totalCount: number;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<OrgStatusCampaignsResponse> => {
  try {
    // Parse request body to get cognitoId and status
    const body = event.body ? JSON.parse(event.body) : {};
    const cognitoId = body.cognitoId;
    const status = body.status;
    
    if (!cognitoId) {
      throw new HttpError(400, 'cognitoId is required in request body');
    }
    
    if (!status) {
      throw new HttpError(400, 'status is required in request body');
    }

    // Validate status
    const validStatuses = ['draft', 'scheduled', 'sending', 'sent', 'failed'];
    if (!validStatuses.includes(status)) {
      throw new HttpError(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    console.log(`Getting ${status} campaigns for user: ${cognitoId}`);

    // Build query parameters using new PK/SK pattern
    let queryParams: any = {
      TableName: TABLE_NAMES.MAIN_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${cognitoId}`,
        ':sk': `STATUS#${status}#CAMPAIGN`
      },
      ScanIndexForward: false // Sort by SK descending (newest first)
    };

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

    console.log(`Found ${campaigns.length} ${status} campaigns for user: ${cognitoId}`);

    return {
      success: true,
      campaigns,
      status,
      totalCount: campaigns.length,
      message: `Found ${campaigns.length} ${status} campaigns for user: ${cognitoId}`
    };

  } catch (error) {
    console.error('Error getting organization campaigns by status:', error);
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to get organization campaigns by status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
