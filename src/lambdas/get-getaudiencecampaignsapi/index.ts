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

interface AudienceCampaign {
  userId: string;
  email: string;
  campaignId: string;
  campaignName: string;
  sentAt: string;
  status?: string;
  subject?: string;
  fromEmail?: string;
  fromName?: string;
}

interface AudienceCampaignsResponse {
  success: boolean;
  email: string;
  campaigns: AudienceCampaign[];
  totalCount: number;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<AudienceCampaignsResponse> => {
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

    console.log(`Getting campaigns for audience member: ${email} (user: ${userId})`);

    // Query campaigns for this specific audience member
    const queryParams: any = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `AUDIENCE_CAMPAIGNS#${userId}#${email}`,
        ':sk': 'CAMPAIGN#'
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
    const campaigns: AudienceCampaign[] = (result.Items || []).map(item => ({
      userId: item.userId,
      email: item.email,
      campaignId: item.campaignId,
      campaignName: item.campaignName,
      sentAt: item.sentAt,
      status: item.status,
      subject: item.subject,
      fromEmail: item.fromEmail,
      fromName: item.fromName
    }));

    console.log(`Found ${campaigns.length} campaigns for ${email}`);

    return {
      success: true,
      email,
      campaigns,
      totalCount: campaigns.length,
      message: `Found ${campaigns.length} campaigns for ${email}`
    };

  } catch (error) {
    console.error('Error getting audience campaigns:', error);
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to get audience campaigns: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);