import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface SendCampaignRequest {
  cognitoId: string;
  campaignId: string;
}

interface SendCampaignResponse {
  success: boolean;
  cognitoId?: string;
  campaignId?: string;
  campaignName?: string;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<SendCampaignResponse> => {
  try {
    const body = event.body ? JSON.parse(event.body) as SendCampaignRequest : undefined;
    
    if (!body) {
      throw new HttpError(400, 'Request body is required');
    }

    if (!body.cognitoId || typeof body.cognitoId !== 'string') {
      throw new HttpError(400, 'cognitoId is required and must be a string');
    }

    if (!body.campaignId || typeof body.campaignId !== 'string') {
      throw new HttpError(400, 'campaignId is required and must be a string');
    }

    const nowIso = new Date().toISOString();
    
    console.log('Starting campaign send for:', body.cognitoId, body.campaignId);

    // 1. Fetch campaign details
    const campaignResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${body.cognitoId}`,
        SK: `CAMPAIGN#${body.campaignId}`
      }
    }));

    if (!campaignResult.Item) {
      throw new HttpError(404, 'Campaign not found');
    }

    const campaign = campaignResult.Item;
    console.log('Found campaign:', JSON.stringify(campaign, null, 2));

    // Validate campaign status
    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new HttpError(400, `Campaign cannot be sent. Current status: ${campaign.status}`);
    }

    // 2. Get audience members based on campaign recipients
    let recipients: string[] = [];
    
    if (campaign.recipients && campaign.recipients.type === 'groups' && campaign.recipients.groupIds) {
      // Get audience members from specific groups
      console.log('Getting recipients from groups:', campaign.recipients.groupIds);
      
      for (const groupId of campaign.recipients.groupIds) {
        const groupResult = await docClient.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${body.cognitoId}#GROUP#${groupId}`,
            ':sk': 'AUDIENCE#'
          }
        }));
        
        const groupEmails = groupResult.Items?.map(item => item.email).filter(email => email) || [];
        recipients = recipients.concat(groupEmails);
        console.log(`Group ${groupId} has ${groupEmails.length} members`);
      }
    } else if (campaign.recipients && campaign.recipients.type === 'all_audience') {
      // Get all audience members
      console.log('Getting all audience members');
      const audienceResult = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${body.cognitoId}`,
          ':sk': 'AUDIENCE#'
        }
      }));

      recipients = audienceResult.Items?.map(item => item.email).filter(email => email) || [];
    }

    console.log(`Found ${recipients.length} recipients:`, recipients);

    if (recipients.length === 0) {
      throw new HttpError(400, 'No recipients found for this campaign');
    }

    // 3. Update campaign status from "draft" to "sent" (primary record only for now)
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${body.cognitoId}`,
        SK: `CAMPAIGN#${body.campaignId}`
      },
      UpdateExpression: 'SET #status = :status, #sentAt = :sentAt, #lastModified = :lastModified',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#sentAt': 'sentAt',
        '#lastModified': 'lastModified'
      },
      ExpressionAttributeValues: {
        ':status': 'sent',
        ':sentAt': nowIso,
        ':lastModified': nowIso
      }
    }));

    console.log('Campaign status updated to sent');

    return {
      success: true,
      cognitoId: body.cognitoId,
      campaignId: body.campaignId,
      campaignName: campaign.name,
      message: `Campaign marked as sent. Found ${recipients.length} recipients.`
    };

  } catch (error) {
    console.error('Error processing campaign send:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(500, `Failed to process campaign send: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
