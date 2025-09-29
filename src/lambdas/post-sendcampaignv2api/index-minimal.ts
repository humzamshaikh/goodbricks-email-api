import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendBulkTemplatedEmailCommand, GetTemplateCommand } from '@aws-sdk/client-ses';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-west-1'
});

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface SendCampaignV2Response {
  success: boolean;
  message: string;
  campaignId: string;
  emailsSent: number;
  recipients: string[];
  errors?: string[];
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<SendCampaignV2Response> => {
  try {
    console.log('Send Campaign V2 Minimal - Starting...');
    console.log('Event:', JSON.stringify(event, null, 2));
    
    const userId = event.pathParameters?.userId;
    const campaignId = event.pathParameters?.campaignId;

    if (!userId) {
      throw new HttpError(400, 'userId is required');
    }
    if (!campaignId) {
      throw new HttpError(400, 'campaignId is required');
    }

    console.log(`Processing campaign: ${campaignId} for user: ${userId}`);

    // Step 1: Get campaign details
    console.log('Step 1: Fetching campaign details...');
    const campaignResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `CAMPAIGN#${campaignId}`
      }
    }));

    if (!campaignResult.Item) {
      throw new HttpError(404, 'Campaign not found');
    }

    const campaign = campaignResult.Item;
    console.log('Campaign found:', {
      name: campaign.name,
      status: campaign.status,
      recipients: campaign.recipients
    });

    // Step 2: Get recipients
    console.log('Step 2: Getting recipients...');
    let recipients: string[] = [];

    if (campaign.recipients?.type === 'groups' && campaign.recipients.groupIds) {
      console.log(`Querying groups: ${campaign.recipients.groupIds.join(', ')}`);
      
      for (const groupId of campaign.recipients.groupIds) {
        const groupResult = await docClient.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}#GROUP#${groupId}`,
            ':sk': 'AUDIENCE#'
          }
        }));

        if (groupResult.Items) {
          const groupEmails = groupResult.Items
            .map(item => item.email)
            .filter(email => email);
          
          recipients.push(...groupEmails);
          console.log(`Group ${groupId} has ${groupEmails.length} members:`, groupEmails);
        }
      }
    }

    if (recipients.length === 0) {
      throw new HttpError(400, 'No recipients found for this campaign');
    }

    console.log(`Found ${recipients.length} recipients:`, recipients);

    // Step 3: Get recipient details
    console.log('Step 3: Getting recipient details...');
    const recipientDetails = [];
    
    for (const email of recipients) {
      try {
        const result = await docClient.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${userId}`,
            SK: `AUDIENCE#${email}`
          }
        }));
        
        if (result.Item) {
          recipientDetails.push({
            email: result.Item.email || email,
            firstName: result.Item.firstName || '',
            lastName: result.Item.lastName || ''
          });
        } else {
          recipientDetails.push({
            email,
            firstName: '',
            lastName: ''
          });
        }
      } catch (error) {
        console.error(`Error getting details for ${email}:`, error);
        recipientDetails.push({
          email,
          firstName: '',
          lastName: ''
        });
      }
    }

    console.log(`Retrieved details for ${recipientDetails.length} recipients`);

    // Step 4: Send bulk email
    console.log('Step 4: Sending bulk email...');
    
    const destinations = recipientDetails.map(recipient => ({
      Destination: {
        ToAddresses: [recipient.email]
      },
      ReplacementTemplateData: JSON.stringify({
        firstName: recipient.firstName || '',
        lastName: recipient.lastName || ''
      })
    }));

    const bulkEmailParams = {
      Source: campaign.metadata.fromName 
        ? `${campaign.metadata.fromName} <${campaign.metadata.fromEmail}>` 
        : campaign.metadata.fromEmail,
      Template: campaignId,
      Destinations: destinations
    };

    console.log('Sending bulk email with params:', JSON.stringify(bulkEmailParams, null, 2));

    const command = new SendBulkTemplatedEmailCommand(bulkEmailParams);
    const result = await sesClient.send(command);
    
    console.log('Bulk email sent successfully:', result);

    // Step 5: Update campaign status
    console.log('Step 5: Updating campaign status...');
    const nowIso = new Date().toISOString();

    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `CAMPAIGN#${campaignId}`
      },
      UpdateExpression: 'SET #status = :status, lastModified = :lastModified, sentAt = :sentAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'sent',
        ':lastModified': nowIso,
        ':sentAt': nowIso
      }
    }));

    console.log('Campaign status updated to sent');

    return {
      success: true,
      message: `Campaign sent successfully. ${recipients.length} emails sent.`,
      campaignId,
      emailsSent: recipients.length,
      recipients: recipients
    };

  } catch (error) {
    console.error('Error in Send Campaign V2 Minimal:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to send campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);