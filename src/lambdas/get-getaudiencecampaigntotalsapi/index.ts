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

interface AudienceMemberCampaignTotals {
  email: string;
  firstName?: string;
  lastName?: string;
  totalCampaigns: number;
  sentCampaigns: number;
  lastSentAt?: string;
  groups: string[];
}

interface AudienceCampaignTotalsResponse {
  success: boolean;
  userId: string;
  audienceMembers: AudienceMemberCampaignTotals[];
  totalMembers: number;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<AudienceCampaignTotalsResponse> => {
  try {
    const userId = event.pathParameters?.userId;
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 100;

    if (!userId) {
      throw new HttpError(400, 'userId is required');
    }

    console.log(`Getting campaign totals for all audience members (user: ${userId})`);

    // First, get all audience members
    const audienceResult = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'AUDIENCE#'
      },
      Limit: limit
    }));

    if (!audienceResult.Items || audienceResult.Items.length === 0) {
      return {
        success: true,
        userId,
        audienceMembers: [],
        totalMembers: 0,
        message: 'No audience members found'
      };
    }

    const audienceMembers: AudienceMemberCampaignTotals[] = [];

    // For each audience member, get their campaign totals
    for (const member of audienceResult.Items) {
      const email = member.email;
      if (!email) continue;

      // Query campaigns for this specific audience member
      const campaignResult = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `AUDIENCE_CAMPAIGNS#${userId}#${email}`,
          ':sk': 'CAMPAIGN#'
        }
      }));

      const campaigns = campaignResult.Items || [];
      const sentCampaigns = campaigns.filter(c => c.status === 'sent');
      
      const lastSentAt = sentCampaigns.length > 0 
        ? sentCampaigns
            .map(c => c.sentAt)
            .filter(sentAt => sentAt)
            .sort()
            .reverse()[0]
        : undefined;

      audienceMembers.push({
        email,
        firstName: member.firstName,
        lastName: member.lastName,
        totalCampaigns: campaigns.length,
        sentCampaigns: sentCampaigns.length,
        lastSentAt,
        groups: member.tags || []
      });
    }

    // Sort by total campaigns (descending)
    audienceMembers.sort((a, b) => b.totalCampaigns - a.totalCampaigns);

    console.log(`Found campaign totals for ${audienceMembers.length} audience members`);

    return {
      success: true,
      userId,
      audienceMembers,
      totalMembers: audienceMembers.length,
      message: `Found campaign totals for ${audienceMembers.length} audience members`
    };

  } catch (error) {
    console.error('Error getting audience campaign totals:', error);
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to get audience campaign totals: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
