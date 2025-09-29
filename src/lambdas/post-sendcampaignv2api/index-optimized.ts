import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
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

// Helper function to chunk array into smaller arrays
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Helper function to get recipient details efficiently
async function getRecipientDetails(userId: string, emails: string[]): Promise<any[]> {
  const recipients = [];
  
  // Process in batches to avoid overwhelming DynamoDB
  const batchSize = 25;
  const emailBatches = chunkArray(emails, batchSize);
  
  for (const emailBatch of emailBatches) {
    const batchPromises = emailBatch.map(async (email) => {
      try {
        const result = await docClient.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${userId}`,
            SK: `AUDIENCE#${email}`
          }
        }));
        
        if (result.Item) {
          return {
            email: result.Item.email || email,
            firstName: result.Item.firstName || '',
            lastName: result.Item.lastName || '',
            organization: result.Item.organization || ''
          };
        } else {
          return {
            email,
            firstName: '',
            lastName: '',
            organization: ''
          };
        }
      } catch (error) {
        console.error(`Error getting details for ${email}:`, error);
        return {
          email,
          firstName: '',
          lastName: '',
          organization: ''
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    recipients.push(...batchResults);
  }
  
  return recipients;
}

interface SendCampaignV2Response {
  success: boolean;
  message: string;
  campaignId: string;
  emailsSent: number;
  recipients: string[];
  errors?: string[];
  batchesProcessed?: number;
  bulkSending?: boolean;
  processingTime?: number;
  averageTimePerEmail?: number;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<SendCampaignV2Response> => {
  const startTime = Date.now();
  
  try {
    console.log('Send Campaign V2 Optimized - Starting...');
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
          console.log(`Group ${groupId} has ${groupEmails.length} members`);
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
        console.log(`Found ${recipients.length} audience members`);
      }
    }

    if (recipients.length === 0) {
      throw new HttpError(400, 'No recipients found for this campaign');
    }

    console.log(`Found ${recipients.length} total recipients`);

    // Step 4: Validate required metadata
    if (!campaign.metadata?.subject) {
      throw new HttpError(400, 'Campaign metadata must include subject');
    }
    if (!campaign.metadata?.fromEmail) {
      throw new HttpError(400, 'Campaign metadata must include fromEmail');
    }

    // Step 5: Validate SES template exists
    console.log('Step 3: Validating SES template...');
    try {
      await sesClient.send(new GetTemplateCommand({ TemplateName: campaignId }));
      console.log(`SES template found: ${campaignId}`);
    } catch (templateError: any) {
      if (templateError.name === 'TemplateDoesNotExistException') {
        throw new HttpError(404, `SES template '${campaignId}' not found. Please create the template first using the create campaign API.`);
      }
      throw new HttpError(500, `Failed to validate SES template: ${templateError.message}`);
    }

    // Step 6: Get recipient details for template data
    console.log('Step 4: Getting recipient details...');
    let recipientDetails = [];
    try {
      recipientDetails = await getRecipientDetails(userId, recipients);
      console.log(`Retrieved details for ${recipientDetails.length} recipients`);
    } catch (error) {
      console.error('Error getting recipient details:', error);
      throw new HttpError(500, `Failed to get recipient details: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Step 7: Send bulk emails using SES templates
    console.log('Step 5: Sending bulk emails...');
    const emailResults = [];
    const errors = [];

    // Chunk recipients into batches of 50 (SES limit)
    const batches = chunkArray(recipients, 50);
    console.log(`Processing ${batches.length} batches of up to 50 recipients each`);

    let totalSuccessful = 0;
    let totalFailed = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchRecipients = recipientDetails.filter(recipient => batch.includes(recipient.email));
      
      try {
        console.log(`Processing batch ${i + 1}/${batches.length} with ${batchRecipients.length} recipients`);
        
        const destinations = batchRecipients.map(recipient => ({
          Destination: {
            ToAddresses: [recipient.email]
          },
          ReplacementTemplateData: JSON.stringify({
            firstName: recipient.firstName || '',
            lastName: recipient.lastName || '',
            email: recipient.email,
            organization: recipient.organization || ''
          })
        }));

        const bulkEmailParams = {
          Source: campaign.metadata.fromName 
            ? `${campaign.metadata.fromName} <${campaign.metadata.fromEmail}>` 
            : campaign.metadata.fromEmail,
          Template: campaignId,
          Destinations: destinations
        };

        const command = new SendBulkTemplatedEmailCommand(bulkEmailParams);
        const result = await sesClient.send(command);
        
        console.log(`Batch ${i + 1} sent successfully, Status: ${result.Status}`);
        
        // Track individual results
        batchRecipients.forEach(recipient => {
          emailResults.push({ 
            success: true, 
            recipient: recipient.email, 
            messageId: `batch-${i + 1}-${Date.now()}`,
            batchId: i + 1
          });
        });
        
        totalSuccessful += batchRecipients.length;
        
      } catch (batchError) {
        console.error(`Failed to send batch ${i + 1}:`, batchError);
        const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
        errors.push(`Batch ${i + 1}: ${errorMessage}`);
        
        // Track individual failures
        batchRecipients.forEach(recipient => {
          emailResults.push({ 
            success: false, 
            recipient: recipient.email, 
            error: batchError,
            batchId: i + 1
          });
        });
        
        totalFailed += batchRecipients.length;
      }
    }

    const successful = emailResults.filter(r => r.success);
    const failed = emailResults.filter(r => !r.success);

    console.log(`Email sending complete. Successful: ${successful.length}, Failed: ${failed.length}`);
    console.log(`Processed ${batches.length} batches total`);

    // Step 8: Update campaign status if any emails were sent successfully
    if (successful.length > 0) {
      console.log('Step 6: Updating campaign status...');
      const nowIso = new Date().toISOString();

      // Update main campaign record
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: `CAMPAIGN#${campaignId}`
        },
        UpdateExpression: 'SET #status = :status, lastModified = :lastModified, sentAt = :sentAt, emailsSent = :emailsSent',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'sent',
          ':lastModified': nowIso,
          ':sentAt': nowIso,
          ':emailsSent': successful.length
        }
      }));

      // Create campaign recipients record for tracking
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `CAMPAIGN_RECIPIENTS#${campaignId}`,
          SK: `SENT#${nowIso}`,
          campaignId,
          userId,
          totalRecipients: recipients.length,
          successfulEmails: successful.length,
          failedEmails: failed.length,
          batchesProcessed: batches.length,
          sentAt: nowIso,
          campaignName: campaign.name,
          description: campaign.description,
          subject: campaign.metadata?.subject,
          fromEmail: campaign.metadata?.fromEmail,
          fromName: campaign.metadata?.fromName,
          status: 'sent',
          messageId: `campaign-${campaignId}-${Date.now()}`
        }
      }));

      console.log('Campaign status updated to sent');
    }

    const endTime = Date.now();
    const processingTime = endTime - startTime;
    const averageTimePerEmail = processingTime / recipients.length;

    return {
      success: true,
      message: `Campaign sent successfully using SES bulk templates. ${successful.length} emails sent, ${failed.length} failed.`,
      campaignId,
      emailsSent: successful.length,
      recipients: successful.map(r => r.recipient),
      errors: errors.length > 0 ? errors : undefined,
      batchesProcessed: batches.length,
      bulkSending: true,
      processingTime,
      averageTimePerEmail: Math.round(averageTimePerEmail * 100) / 100
    };

  } catch (error) {
    console.error('Error in Send Campaign V2 Optimized:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to send campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);



