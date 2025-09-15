import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAMES = {
  EMAIL_CAMPAIGNS: process.env.EMAIL_CAMPAIGNS_TABLE_NAME || 'email-campaigns'
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
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledAt?: string;
  sentAt?: string;
  createdAt?: string;
  lastModified: string;
  metadata: {
    subject: string;
    fromName: string;
    fromEmail: string;
    previewText?: string;
  };
}

interface CampaignsResponse {
  campaigns: CampaignItem[];
  pagination?: {
    nextToken?: string;
    count: number;
  };
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<CampaignsResponse> => {
  try {
    const userId = event.pathParameters?.userId || event.queryStringParameters?.userId;
    if (!userId) {
      throw new Error('userId is required');
    }

    const status = event.queryStringParameters?.status as CampaignItem['status'] | undefined;
    const scheduledFrom = event.queryStringParameters?.scheduledFrom; // ISO string
    const scheduledTo = event.queryStringParameters?.scheduledTo; // ISO string
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 50;
    const nextToken = event.queryStringParameters?.nextToken;

    // Query by userId and filter in-table due to current GSI design
    const queryParams: any = {
      TableName: TABLE_NAMES.EMAIL_CAMPAIGNS,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      Limit: limit
    };

    const filterExpressions: string[] = [];
    if (status) {
      filterExpressions.push('#status = :status');
      queryParams.ExpressionAttributeValues[':status'] = status;
      queryParams.ExpressionAttributeNames = { ...(queryParams.ExpressionAttributeNames || {}), '#status': 'status' };
    }
    if (scheduledFrom || scheduledTo) {
      if (scheduledFrom && scheduledTo) {
        filterExpressions.push('#scheduledAt BETWEEN :from AND :to');
        queryParams.ExpressionAttributeValues[':from'] = scheduledFrom;
        queryParams.ExpressionAttributeValues[':to'] = scheduledTo;
      } else if (scheduledFrom) {
        filterExpressions.push('#scheduledAt >= :from');
        queryParams.ExpressionAttributeValues[':from'] = scheduledFrom;
      } else if (scheduledTo) {
        filterExpressions.push('#scheduledAt <= :to');
        queryParams.ExpressionAttributeValues[':to'] = scheduledTo;
      }
      queryParams.ExpressionAttributeNames = { ...(queryParams.ExpressionAttributeNames || {}), '#scheduledAt': 'scheduledAt' };
    }
    if (filterExpressions.length > 0) {
      queryParams.FilterExpression = filterExpressions.join(' AND ');
    }

    if (nextToken) {
      queryParams.ExclusiveStartKey = JSON.parse(decodeURIComponent(nextToken));
    }

    const result = await docClient.send(new QueryCommand(queryParams));
    const campaigns: CampaignItem[] = (result.Items || []) as CampaignItem[];

    const response: CampaignsResponse = {
      campaigns,
      pagination: { count: campaigns.length }
    };

    if (result.LastEvaluatedKey) {
      response.pagination!.nextToken = encodeURIComponent(JSON.stringify(result.LastEvaluatedKey));
    }

    return response;
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    throw new Error(`Failed to fetch campaigns: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);


