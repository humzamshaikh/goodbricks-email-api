import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
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
  EMAIL_MAIN: process.env.EMAIL_MAIN_TABLE_NAME || 'goodbricks-email-main',
  MAIN_TABLE: process.env.MAIN_TABLE_NAME || 'goodbricks-email-main'
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
  recipients?: {
    type: 'groups' | 'all_audience';
    groupIds?: string[];
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
  try {
    const userId = event.pathParameters?.userId;
    const campaignId = event.pathParameters?.campaignId;

    if (!userId) {
      throw new HttpError(400, 'userId is required');
    }
    if (!campaignId) {
      throw new HttpError(400, 'campaignId is required');
    }

    console.log(`Starting campaign send for userId: ${userId}, campaignId: ${campaignId}`);
    // Fetch campaign details
    const campaignResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAMES.MAIN_TABLE,
      Key: {
        PK: `USER#${userId}`,
        SK: `CAMPAIGN#${campaignId}`
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

    // Get audience based on campaign recipients field or fallback to audienceSelection
    let recipients: string[] = [];
    let recipientGroups: string[] = [];

    // Use recipients field if available, otherwise fallback to audienceSelection
    if (campaign.recipients) {
      if (campaign.recipients.type === 'groups' && campaign.recipients.groupIds) {
        // Get audience members from specific groups
        recipientGroups = campaign.recipients.groupIds;
        
        // Query each group to get members
        const groupMemberPromises = campaign.recipients.groupIds.map(async (groupId) => {
          const groupResult = await docClient.send(new QueryCommand({
            TableName: TABLE_NAMES.EMAIL_MAIN,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
              ':pk': `USER#${userId}#GROUP#${groupId}`,
              ':sk': 'AUDIENCE#'
            }
          }));
          return groupResult.Items?.map(item => item.email).filter(email => email) || [];
        });
        
        const groupMembers = await Promise.all(groupMemberPromises);
        recipients = groupMembers.flat();
      } else if (campaign.recipients.type === 'all_audience') {
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
    } else {
      // Fallback to original audienceSelection logic
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
    }

    console.log(`Found ${recipients.length} recipients:`, recipients);
    
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
    console.log('Starting to send emails via SES...');
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

    const results = await Promise.allSettled(emailPromises);
    const successful = results
      .filter(r => r.status === 'fulfilled' && r.value.success)
      .map(r => r.value);
    const failed = results
      .filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success))
      .map(r => r.status === 'rejected' ? { success: false, recipient: 'unknown', error: r.reason } : r.value);

    const nowIso = new Date().toISOString();

    // Update campaign status to sent in main table
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAMES.MAIN_TABLE,
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

    // Update index records in main table
    const updateRecords = [
      // Update organization campaigns index
      {
        PK: `ORG_CAMPAIGNS#${userId}`,
        SK: `CAMPAIGN#${campaignId}`,
        userId: userId,
        campaignId: campaignId,
        name: campaign.name,
        description: campaign.description,
        templateId: campaign.templateId,
        templateVersion: campaign.templateVersion,
        audienceSelection: campaign.audienceSelection,
        recipients: campaign.recipients,
        status: 'sent',
        scheduledAt: campaign.scheduledAt,
        sentAt: nowIso,
        createdAt: campaign.createdAt,
        lastModified: nowIso,
        metadata: campaign.metadata
      },
      // Update organization status campaigns index (remove from old status, add to sent)
      {
        PK: `ORG_STATUS_CAMPAIGNS#${userId}#sent`,
        SK: `CAMPAIGN#${campaignId}`,
        userId: userId,
        campaignId: campaignId,
        name: campaign.name,
        description: campaign.description,
        templateId: campaign.templateId,
        templateVersion: campaign.templateVersion,
        audienceSelection: campaign.audienceSelection,
        recipients: campaign.recipients,
        status: 'sent',
        scheduledAt: campaign.scheduledAt,
        sentAt: nowIso,
        createdAt: campaign.createdAt,
        lastModified: nowIso,
        metadata: campaign.metadata
      }
    ];

    // Add group-specific updates if recipients are group-based
    if (campaign.recipients?.type === 'groups' && campaign.recipients.groupIds) {
      campaign.recipients.groupIds.forEach(groupId => {
        updateRecords.push({
          PK: `GROUP_CAMPAIGNS#${userId}#${groupId}`,
          SK: `CAMPAIGN#${campaignId}`,
          userId: userId,
          campaignId: campaignId,
          groupId: groupId,
          name: campaign.name,
          description: campaign.description,
          templateId: campaign.templateId,
          templateVersion: campaign.templateVersion,
          audienceSelection: campaign.audienceSelection,
          recipients: campaign.recipients,
          status: 'sent',
          scheduledAt: campaign.scheduledAt,
          sentAt: nowIso,
          createdAt: campaign.createdAt,
          lastModified: nowIso,
          metadata: campaign.metadata
        });
      });
    }

    // Batch write all updates
    const batchRequests = updateRecords.map(record => ({
      PutRequest: {
        Item: record
      }
    }));

    // Process in batches of 25 (DynamoDB limit)
    for (let i = 0; i < batchRequests.length; i += 25) {
      const batch = batchRequests.slice(i, i + 25);
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAMES.MAIN_TABLE]: batch
        }
      }));
    }

    // Create audience member campaign records for each successful recipient
    if (successful.length > 0) {
      const audienceMemberRecords = successful.map(recipient => ({
        PK: `AUDIENCE_CAMPAIGNS#${userId}#${recipient}`,
        SK: `CAMPAIGN#${campaignId}`,
        userId: userId,
        campaignId: campaignId,
        email: recipient,
        name: campaign.name,
        description: campaign.description,
        templateId: campaign.templateId,
        templateVersion: campaign.templateVersion,
        audienceSelection: campaign.audienceSelection,
        recipients: campaign.recipients,
        status: 'sent',
        scheduledAt: campaign.scheduledAt,
        sentAt: nowIso,
        createdAt: campaign.createdAt,
        lastModified: nowIso,
        metadata: campaign.metadata
      }));

      // Batch write audience member records
      const audienceBatchRequests = audienceMemberRecords.map(record => ({
        PutRequest: {
          Item: record
        }
      }));

      // Process in batches of 25 (DynamoDB limit)
      for (let i = 0; i < audienceBatchRequests.length; i += 25) {
        const batch = audienceBatchRequests.slice(i, i + 25);
        await docClient.send(new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAMES.MAIN_TABLE]: batch
          }
        }));
      }

      // Save recipient data for analytics
      const recipientData = {
        PK: `CAMPAIGN_RECIPIENTS#${campaignId}`,
        SK: `SENT#${nowIso}`,
        campaignId: campaignId,
        userId: userId,
        recipientEmails: successful.map(r => r.recipient),
        recipientGroups: recipientGroups,
        totalSent: successful.length,
        totalFailed: failed.length,
        sentAt: nowIso,
        createdAt: nowIso
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAMES.EMAIL_MAIN,
        Item: recipientData
      }));
    }

    return {
      success: true,
      message: `Campaign sent successfully. ${successful.length} emails sent, ${failed.length} failed.`,
      campaignId: campaignId,
      emailsSent: successful.length,
      recipientGroups: recipientGroups,
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
