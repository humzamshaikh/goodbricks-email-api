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
  campaigns: CampaignItem[];
  status: string;
  pagination?: {
    nextToken?: string;
    count: number;
  };
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<OrgStatusCampaignsResponse> => {
  try {
    const userId = event.pathParameters?.userId || event.queryStringParameters?.userId;
    const status = event.pathParameters?.status || event.queryStringParameters?.status;
    
    if (!userId) {
      throw new HttpError(400, 'userId is required');
    }
    
    if (!status) {
      throw new HttpError(400, 'status is required');
    }

    // Validate status
    const validStatuses = ['draft', 'scheduled', 'sending', 'sent', 'failed'];
    if (!validStatuses.includes(status)) {
      throw new HttpError(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Parse query parameters
    const limit = parseInt(event.queryStringParameters?.limit || '20');
    const nextToken = event.queryStringParameters?.nextToken;

    // Build query parameters
    let queryParams: any = {
      TableName: TABLE_NAMES.MAIN_TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `ORG_STATUS_CAMPAIGNS#${userId}#${status}`
      },
      Limit: limit,
      ScanIndexForward: false // Sort by SK descending (newest first)
    };

    // Add pagination token if provided
    if (nextToken) {
      try {
        queryParams.ExclusiveStartKey = JSON.parse(decodeURIComponent(nextToken));
      } catch (error) {
        throw new HttpError(400, 'Invalid nextToken format');
      }
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

    // Build pagination response
    const response: OrgStatusCampaignsResponse = {
      campaigns,
      status,
      pagination: {
        count: campaigns.length
      }
    };

    // Add nextToken if there are more results
    if (result.LastEvaluatedKey) {
      response.pagination!.nextToken = encodeURIComponent(JSON.stringify(result.LastEvaluatedKey));
    }

    return response;

  } catch (error) {
    console.error('Error getting organization campaigns by status:', error);
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to get organization campaigns by status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
