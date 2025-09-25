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

interface GroupCampaignsResponse {
  campaigns: CampaignItem[];
  groupId: string;
  pagination?: {
    nextToken?: string;
    count: number;
  };
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<GroupCampaignsResponse> => {
  try {
    const userId = event.pathParameters?.userId || event.queryStringParameters?.userId;
    const groupId = event.pathParameters?.groupId || event.queryStringParameters?.groupId;
    
    if (!userId) {
      throw new HttpError(400, 'userId is required');
    }
    
    if (!groupId) {
      throw new HttpError(400, 'groupId is required');
    }

    // Parse query parameters
    const limit = parseInt(event.queryStringParameters?.limit || '20');
    const nextToken = event.queryStringParameters?.nextToken;
    const status = event.queryStringParameters?.status;

    // Build query parameters
    let queryParams: any = {
      TableName: TABLE_NAMES.MAIN_TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `GROUP_CAMPAIGNS#${userId}#${groupId}`
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

    // Build pagination response
    const response: GroupCampaignsResponse = {
      campaigns,
      groupId,
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
    console.error('Error getting group campaigns:', error);
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to get group campaigns: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
