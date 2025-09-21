import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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

const TABLE_NAMES = {
  EMAIL_CAMPAIGNS: process.env.EMAIL_CAMPAIGNS_TABLE_NAME || 'email-campaigns',
  EMAIL_MAIN: process.env.EMAIL_MAIN_TABLE_NAME || 'goodbricks-email-main'
} as const;

interface SendCampaignResponse {
  success: boolean;
  message: string;
  campaignId?: string;
  emailsSent?: number;
  errors?: string[];
}

interface Campaign {
  userId: string;
  campaignId: string;
  name: string;
  description?: string;
  templateId: string;
  templateVersion: number;
  audienceSelection: {
    type: 'tag' | 'list' | 'all';
    values: string[];
  };
  status: string;
  scheduledAt?: string;
  metadata: {
    subject?: string;
    fromName?: string;
    fromEmail?: string;
    previewText?: string;
  };
}

interface AudienceMember {
  userId: string;
  email: string;
  tags?: string[];
  status?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<SendCampaignResponse> => {
  const userId = event.pathParameters?.userId;
  const campaignId = event.pathParameters?.campaignId;

  if (!userId) {
    throw new HttpError(400, 'userId is required');
  }
  if (!campaignId) {
    throw new HttpError(400, 'campaignId is required');
  }

  try {
    // Fetch campaign details
    const campaignResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAMES.EMAIL_CAMPAIGNS,
      Key: {
        userId: userId,
        campaignId: campaignId
      }
    }));

    if (!campaignResult.Item) {
      throw new HttpError(404, 'Campaign not found');
    }

    const campaign = campaignResult.Item as Campaign;

    // Validate campaign status
    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new HttpError(400, `Campaign cannot be sent. Current status: ${campaign.status}`);
    }

    // Get audience based on campaign audience selection
    let recipients: string[] = [];

    if (campaign.audienceSelection.type === 'list') {
      // Direct email list
      recipients = campaign.audienceSelection.values;
    } else if (campaign.audienceSelection.type === 'tag') {
      // Get audience members by tags
      const audienceResult = await docClient.send(new QueryCommand({
        TableName: TABLE_NAMES.EMAIL_MAIN,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`
        }
      }));

      if (audienceResult.Items) {
        recipients = audienceResult.Items
          .filter(item => item.SK?.startsWith('AUDIENCE#'))
          .filter(item => {
            const member = item as AudienceMember;
            if (!member.tags) return false;
            return campaign.audienceSelection.values.some(tag => 
              member.tags!.includes(tag)
            );
          })
          .map(item => (item as AudienceMember).email)
          .filter(email => email);
      }
    } else if (campaign.audienceSelection.type === 'all') {
      // Get all audience members
      const audienceResult = await docClient.send(new QueryCommand({
        TableName: TABLE_NAMES.EMAIL_MAIN,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`
        }
      }));

      if (audienceResult.Items) {
        recipients = audienceResult.Items
          .filter(item => item.SK?.startsWith('AUDIENCE#'))
          .map(item => (item as AudienceMember).email)
          .filter(email => email);
      }
    }

    if (recipients.length === 0) {
      throw new HttpError(400, 'No recipients found for this campaign');
    }

    // Validate required metadata
    if (!campaign.metadata.subject) {
      throw new HttpError(400, 'Campaign metadata must include subject');
    }
    if (!campaign.metadata.fromEmail) {
      throw new HttpError(400, 'Campaign metadata must include fromEmail');
    }

    // Send emails via SES
    const emailPromises = recipients.map(async (recipient) => {
      try {
        const emailParams = {
          Source: campaign.metadata.fromName 
            ? `${campaign.metadata.fromName} <${campaign.metadata.fromEmail}>` 
            : campaign.metadata.fromEmail!,
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
        await sesClient.send(command);
        return { success: true, recipient };
      } catch (error) {
        console.error(`Failed to send email to ${recipient}:`, error);
        return { success: false, recipient, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    const results = await Promise.all(emailPromises);
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    // Update campaign status
    await docClient.send(new GetCommand({
      TableName: TABLE_NAMES.EMAIL_CAMPAIGNS,
      Key: {
        userId: userId,
        campaignId: campaignId
      }
    }));

    return {
      success: true,
      message: `Campaign sent successfully. ${successful.length} emails sent, ${failed.length} failed.`,
      campaignId: campaignId,
      emailsSent: successful.length,
      errors: failed.length > 0 ? failed.map(f => `${f.recipient}: ${f.error}`) : undefined
    };

  } catch (error) {
    console.error('Error sending campaign:', error);
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(500, `Failed to send campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
