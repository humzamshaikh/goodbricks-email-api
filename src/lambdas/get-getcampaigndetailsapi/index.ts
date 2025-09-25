import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface CampaignDetails {
  userId: string;
  campaignId: string;
  name?: string;
  description?: string;
  templateId?: string;
  templateVersion?: number;
  audienceSelection?: {
    type: 'tag' | 'list' | 'all';
    values?: string[];
  };
  recipients?: {
    type: 'groups' | 'all_audience';
    groupIds?: string[];
  };
  status?: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledAt?: string;
  sentAt?: string;
  lastModified?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike) => {
  try {
    const userId = event.pathParameters?.userId || event.queryStringParameters?.userId;
    const campaignId = event.pathParameters?.campaignId || event.queryStringParameters?.campaignId;

    if (!userId) throw new Error('userId is required');
    if (!campaignId) throw new Error('campaignId is required');

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { 
          PK: `USER#${userId}`, 
          SK: `CAMPAIGN#${campaignId}` 
        }
      })
    );

    if (!result.Item) {
      return {
        message: 'Campaign not found',
        userId,
        campaignId
      };
    }

    const campaign = result.Item as CampaignDetails;
    return { campaign };
  } catch (error) {
    console.error('Error fetching campaign details:', error);
    throw new Error(
      `Failed to fetch campaign details: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

export const handler = createHttpHandler(handlerLogic);
