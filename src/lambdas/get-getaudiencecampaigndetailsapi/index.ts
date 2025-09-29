import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface AudienceCampaignDetail {
  campaignId: string;
  campaignName: string;
  description?: string;
  subject: string;
  fromEmail: string;
  fromName?: string;
  status: string;
  sentAt: string;
  messageId?: string;
  templateId?: string;
  templateVersion?: number;
  recipients?: {
    type: string;
    groupIds?: string[];
  };
}

interface AudienceCampaignDetailsResponse {
  success: boolean;
  email: string;
  campaigns: AudienceCampaignDetail[];
  totalCount: number;
  summary: {
    totalCampaigns: number;
    sentCampaigns: number;
    draftCampaigns: number;
    lastSentAt?: string;
    firstSentAt?: string;
  };
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<AudienceCampaignDetailsResponse> => {
  try {
    const userId = event.pathParameters?.userId;
    const email = event.pathParameters?.email;
    const status = event.queryStringParameters?.status; // Optional filter by status
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 50;
    const nextToken = event.queryStringParameters?.nextToken;

    if (!userId) {
      throw new HttpError(400, 'userId is required');
    }
    if (!email) {
      throw new HttpError(400, 'email is required');
    }

    console.log(`Getting detailed campaigns for audience member: ${email} (user: ${userId})`);

    // Query campaigns for this specific audience member
    const queryParams: any = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `AUDIENCE_CAMPAIGNS#${userId}#${email}`,
        ':sk': 'CAMPAIGN'
      },
      Limit: limit,
      ScanIndexForward: false // Most recent first
    };

    // Add status filter if provided
    if (status) {
      queryParams.FilterExpression = '#status = :status';
      queryParams.ExpressionAttributeNames = { '#status': 'status' };
      queryParams.ExpressionAttributeValues[':status'] = status;
    }

    // Add pagination token if provided
    if (nextToken) {
      queryParams.ExclusiveStartKey = JSON.parse(decodeURIComponent(nextToken));
    }

    const result = await docClient.send(new QueryCommand(queryParams));
    const campaigns: AudienceCampaignDetail[] = (result.Items || []).map(item => ({
      campaignId: item.campaignId,
      campaignName: item.campaignName,
      description: item.description,
      subject: item.subject,
      fromEmail: item.fromEmail,
      fromName: item.fromName,
      status: item.status,
      sentAt: item.sentAt,
      messageId: item.messageId,
      templateId: item.templateId,
      templateVersion: item.templateVersion,
      recipients: item.recipients
    }));

    // Calculate summary statistics
    const totalCampaigns = campaigns.length;
    const sentCampaigns = campaigns.filter(c => c.status === 'sent').length;
    const draftCampaigns = campaigns.filter(c => c.status === 'draft').length;
    
    const sentDates = campaigns
      .filter(c => c.status === 'sent' && c.sentAt)
      .map(c => new Date(c.sentAt))
      .sort((a, b) => b.getTime() - a.getTime());
    
    const lastSentAt = sentDates.length > 0 ? sentDates[0].toISOString() : undefined;
    const firstSentAt = sentDates.length > 0 ? sentDates[sentDates.length - 1].toISOString() : undefined;

    console.log(`Found ${campaigns.length} campaigns for ${email}`);

    return {
      success: true,
      email,
      campaigns,
      totalCount: campaigns.length,
      summary: {
        totalCampaigns,
        sentCampaigns,
        draftCampaigns,
        lastSentAt,
        firstSentAt
      },
      message: `Found ${campaigns.length} campaigns for ${email}`
    };

  } catch (error) {
    console.error('Error getting audience campaign details:', error);
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to get audience campaign details: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
