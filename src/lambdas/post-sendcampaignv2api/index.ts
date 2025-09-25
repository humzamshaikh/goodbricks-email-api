import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
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
  campaignId?: string;
  emailsSent?: number;
  recipients?: string[];
  errors?: string[];
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<SendCampaignV2Response> => {
  try {
    console.log('Send Campaign V2 - Starting...');
    
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

    // Step 2: Validate campaign status
    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new HttpError(400, `Campaign cannot be sent. Current status: ${campaign.status}`);
    }

    // Step 3: Get recipients based on campaign recipients
    console.log('Step 2: Getting recipients...');
    let recipients: string[] = [];

    if (campaign.recipients?.type === 'groups' && campaign.recipients.groupIds) {
      console.log(`Querying groups: ${campaign.recipients.groupIds.join(', ')}`);
      
      // Query each group to get members
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
    } else if (campaign.recipients?.type === 'all_audience') {
      console.log('Querying all audience members...');
      const audienceResult = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'AUDIENCE#'
        }
      }));

      if (audienceResult.Items) {
        recipients = audienceResult.Items
          .map(item => item.email)
          .filter(email => email);
        console.log(`Found ${recipients.length} audience members:`, recipients);
      }
    }

    if (recipients.length === 0) {
      throw new HttpError(400, 'No recipients found for this campaign');
    }

    // Step 4: Validate email content
    if (!campaign.metadata?.subject) {
      throw new HttpError(400, 'Campaign metadata must include subject');
    }
    if (!campaign.metadata?.fromEmail) {
      throw new HttpError(400, 'Campaign metadata must include fromEmail');
    }

    console.log('Step 3: Sending emails...');
    console.log(`Sending to ${recipients.length} recipients:`, recipients);

    // Step 5: Send emails
    const emailResults = [];
    const errors = [];

    for (const recipient of recipients) {
      try {
        console.log(`Sending email to: ${recipient}`);
        
        const emailParams = {
          Source: campaign.metadata.fromName 
            ? `${campaign.metadata.fromName} <${campaign.metadata.fromEmail}>` 
            : campaign.metadata.fromEmail,
          Destination: {
            ToAddresses: [recipient]
          },
          Message: {
            Subject: { 
              Data: campaign.metadata.subject, 
              Charset: 'UTF-8' 
            },
            Body: {
              Text: { 
                Data: campaign.description || campaign.metadata.subject, 
                Charset: 'UTF-8' 
              }
            }
          }
        };

        const command = new SendEmailCommand(emailParams);
        const result = await sesClient.send(command);
        
        console.log(`Email sent successfully to ${recipient}, MessageId: ${result.MessageId}`);
        emailResults.push({ success: true, recipient, messageId: result.MessageId });
        
      } catch (error) {
        console.error(`Failed to send email to ${recipient}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${recipient}: ${errorMessage}`);
        emailResults.push({ success: false, recipient, error: errorMessage });
      }
    }

    const successful = emailResults.filter(r => r.success);
    const failed = emailResults.filter(r => !r.success);

    console.log(`Email sending complete. Successful: ${successful.length}, Failed: ${failed.length}`);

    // Step 6: Update campaign status if any emails were sent successfully
    if (successful.length > 0) {
      console.log('Step 4: Updating campaign status...');
      const nowIso = new Date().toISOString();

      // Update main campaign record
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: `CAMPAIGN#${campaignId}`
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

      // Update index records
      const indexUpdates = [
        // Organization campaigns index
        {
          PK: `ORG_CAMPAIGNS#${userId}`,
          SK: `CAMPAIGN#${campaignId}`,
          ...campaign,
          status: 'sent',
          sentAt: nowIso,
          lastModified: nowIso
        },
        // Organization status campaigns index
        {
          PK: `ORG_STATUS_CAMPAIGNS#${userId}#sent`,
          SK: `CAMPAIGN#${campaignId}`,
          ...campaign,
          status: 'sent',
          sentAt: nowIso,
          lastModified: nowIso
        }
      ];

      // Add group-specific updates if applicable
      if (campaign.recipients?.type === 'groups' && campaign.recipients.groupIds) {
        for (const groupId of campaign.recipients.groupIds) {
          indexUpdates.push({
            PK: `GROUP_CAMPAIGNS#${userId}#${groupId}`,
            SK: `CAMPAIGN#${campaignId}`,
            ...campaign,
            status: 'sent',
            sentAt: nowIso,
            lastModified: nowIso
          });
        }
      }

      // Update all index records
      for (const indexRecord of indexUpdates) {
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: indexRecord
        }));
      }

      // Create recipient tracking records
      for (const success of successful) {
        // Campaign recipients record
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `CAMPAIGN_RECIPIENTS#${campaignId}`,
            SK: `SENT#${nowIso}`,
            campaignId,
            recipient: success.recipient,
            messageId: success.messageId,
            sentAt: nowIso
          }
        }));

        // Audience campaign record
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `AUDIENCE_CAMPAIGNS#${userId}#${success.recipient}`,
            SK: `CAMPAIGN#${campaignId}`,
            userId,
            email: success.recipient,
            campaignId,
            campaignName: campaign.name,
            description: campaign.description,
            subject: campaign.metadata?.subject,
            fromEmail: campaign.metadata?.fromEmail,
            fromName: campaign.metadata?.fromName,
            status: 'sent',
            sentAt: nowIso,
            messageId: success.messageId
          }
        }));
      }

      console.log('Campaign status updated to sent');
    }

    return {
      success: true,
      message: `Campaign sent successfully. ${successful.length} emails sent, ${failed.length} failed.`,
      campaignId,
      emailsSent: successful.length,
      recipients: successful.map(r => r.recipient),
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error) {
    console.error('Error in Send Campaign V2:', error);
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to send campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
