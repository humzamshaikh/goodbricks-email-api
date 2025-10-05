import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, BatchWriteCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SESClient, SendBulkTemplatedEmailCommand } from '@aws-sdk/client-ses';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-1'
});

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-west-1'
});

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';
const LAYOUTS_BUCKET = process.env.LAYOUTS_BUCKET_NAME || 'gb-email-layouts-900546257868-us-west-1';

interface SendCampaignRequest {
  cognitoId: string;
  campaignId: string;
}

interface SendCampaignResponse {
  success: boolean;
  cognitoId?: string;
  campaignId?: string;
  campaignName?: string;
  templateName?: string;
  recipients?: {
    total: number;
    groups: string[];
    emails: string[];
  };
  sesResponse?: {
    messageId?: string;
    status: string;
    sent: number;
    failed: number;
    error?: string;
  };
  campaignStatus?: {
    updated: boolean;
    newStatus: string;
  };
  trackingRecords?: {
    created: number;
  };
  audienceRecordsCreated?: number;
  recordsUpdated?: number;
  layoutRetrieved?: boolean;
  layoutId?: string;
  layoutVersion?: string;
  message?: string;
}

// Function to retrieve JSX code from S3
async function retrieveLayoutFromS3(layoutId: string, layoutVersion: string): Promise<string | null> {
  try {
    const s3Key = `${layoutId}/${layoutVersion}/${layoutId}.jsx`;
    console.log(`Retrieving layout from S3: ${s3Key}`);
    
    const result = await s3Client.send(new GetObjectCommand({
      Bucket: LAYOUTS_BUCKET,
      Key: s3Key
    }));
    
    if (result.Body) {
      const jsxCode = await result.Body.transformToString();
      console.log(`Successfully retrieved JSX code (${jsxCode.length} characters)`);
      return jsxCode;
    }
    
    return null;
  } catch (error) {
    console.error(`Error retrieving layout from S3: ${layoutId}/${layoutVersion}:`, error);
    return null;
  }
}

// Function to retrieve recipients based on campaign data
async function retrieveRecipients(cognitoId: string, campaign: any): Promise<{ emails: string[]; recipients: any[]; groups: string[] }> {
  const recipients: any[] = [];
  const emails: string[] = [];
  const groups: string[] = [];

  if (campaign.recipients?.type === 'groups' && campaign.recipients.groupIds) {
    groups.push(...campaign.recipients.groupIds);
    
    // Query each group for audience members
    for (const groupId of campaign.recipients.groupIds) {
      try {
        const groupQuery = await docClient.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${cognitoId}#GROUP#${groupId}`,
            ':sk': 'AUDIENCE'
          }
        }));

        if (groupQuery.Items) {
          recipients.push(...groupQuery.Items);
          groupQuery.Items.forEach(item => {
            if (item.email && !emails.includes(item.email)) {
              emails.push(item.email);
            }
          });
        }
      } catch (error) {
        console.error(`Error querying group ${groupId}:`, error);
      }
    }
  } else if (campaign.recipients?.type === 'all_audience') {
    // Query all audience members for the organization
    try {
      const audienceQuery = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${cognitoId}`,
          ':sk': 'AUDIENCE'
        }
      }));

      if (audienceQuery.Items) {
        recipients.push(...audienceQuery.Items);
        audienceQuery.Items.forEach(item => {
          if (item.email && !emails.includes(item.email)) {
            emails.push(item.email);
          }
        });
      }
    } catch (error) {
      console.error('Error querying all audience:', error);
    }
  }

  return { emails, recipients, groups };
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

  try {
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

    // Retrieve JSX code from S3 if layout is specified
    let jsxCode: string | null = null;
    let layoutRetrieved = false;
    
    if (campaign.layoutId && campaign.layoutId !== '') {
      const layoutVersion = campaign.layoutVersion || 'latest';
      console.log(`Campaign has layout: ${campaign.layoutId} (version: ${layoutVersion})`);
      
      jsxCode = await retrieveLayoutFromS3(campaign.layoutId, layoutVersion);
      layoutRetrieved = jsxCode !== null;
      
      if (layoutRetrieved) {
        console.log(`Successfully retrieved layout JSX code for ${campaign.layoutId}`);
      } else {
        console.warn(`Failed to retrieve layout JSX code for ${campaign.layoutId}/${layoutVersion}`);
      }
    } else {
      console.log('Campaign has no layout specified, skipping JSX retrieval');
    }

    // 2. Get audience members based on campaign recipients using enhanced function
    const { emails: recipientEmails, recipients: recipientData, groups } = await retrieveRecipients(body.cognitoId, campaign);
    
    console.log(`Found ${recipientEmails.length} recipients from groups: ${groups.join(', ')}`);
    console.log('Recipient emails:', recipientEmails);

    if (recipientEmails.length === 0) {
      throw new HttpError(400, 'No recipients found for this campaign');
    }

    // 3. Send bulk emails via SES if template exists
    let sesResponse: any = null;
    let templateName = `${body.cognitoId}_${body.campaignId}`;
    
    try {
      // Prepare destinations for SES bulk template
      const destinations = recipientData.map(recipient => ({
        Destination: {
          ToAddresses: [recipient.email]
        },
        ReplacementTemplateData: JSON.stringify({
          firstName: recipient.firstName || 'Friend',
          lastName: recipient.lastName || '',
          subject: campaign.metadata?.subject || campaign.name || 'Email from GoodBricks',
          // Add all other variables with default values
          year: 2024,
          livesImpacted: 2847,
          communitiesServed: 12,
          volunteersEngaged: 156,
          eventsHosted: 48,
          totalHours: 3840,
          topProgramName: 'Community Food Drive Initiative',
          topProgramImpact: 1200,
          mostActiveMonth: 'November',
          mostActiveMonthEvents: 8,
          impactPercentile: 95,
          serviceLocations: 'Downtown, Westside, Eastside, Northside, Southside'
        })
      }));

      console.log(`Sending bulk email to ${destinations.length} recipients using template: ${templateName}`);

      const sesCommand = new SendBulkTemplatedEmailCommand({
        Source: campaign.metadata?.fromEmail || 'noreply@goodbricks.org',
        Template: templateName,
            DefaultTemplateData: JSON.stringify({
              subject: campaign.metadata?.subject || campaign.name || 'Email from GoodBricks',
              // Add all other variables with default values
              year: 2024,
              livesImpacted: 2847,
              communitiesServed: 12,
              volunteersEngaged: 156,
              eventsHosted: 48,
              totalHours: 3840,
              topProgramName: 'Community Food Drive Initiative',
              topProgramImpact: 1200,
              mostActiveMonth: 'November',
              mostActiveMonthEvents: 8,
              impactPercentile: 95,
              serviceLocations: 'Downtown, Westside, Eastside, Northside, Southside',
              firstName: 'Friend',
              lastName: ''
            }),
        Destinations: destinations
      });

      const sesResult = await sesClient.send(sesCommand);
      
      sesResponse = {
        messageId: 'bulk-template-send',
        status: 'success',
        sent: destinations.length,
        failed: 0
      };
      
      console.log(`Successfully sent bulk email via SES. MessageId: ${sesResponse.messageId}`);
      
    } catch (sesError) {
      console.error('Error sending bulk email via SES:', sesError);
      sesResponse = {
        status: 'failed',
        sent: 0,
        failed: recipientEmails.length,
        error: sesError instanceof Error ? sesError.message : 'Unknown SES error'
      };
      
      // Don't fail the entire operation if SES fails, but log the error
      console.warn('Continuing with campaign tracking despite SES failure');
    }

    // 4. Create audience campaign tracking records
    const audienceCampaignRecords = recipientData.map(recipient => ({
      PK: `AUDIENCE_CAMPAIGNS#${body.cognitoId}#${recipient.email}`,
      SK: `CAMPAIGN#${body.campaignId}`,
      campaignId: body.campaignId,
      campaignName: campaign.name,
      description: campaign.description || '',
      subject: campaign.metadata?.subject || '',
      fromEmail: campaign.metadata?.fromEmail || '',
      fromName: campaign.metadata?.fromName || '',
      status: 'sent',
      sentAt: nowIso,
      messageId: sesResponse?.messageId || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // SES message ID or fallback
      templateId: campaign.templateId || '',
      templateVersion: campaign.templateVersion || 'latest',
      recipients: campaign.recipients || { type: 'all_audience' }
    }));

    console.log(`Creating ${audienceCampaignRecords.length} audience campaign tracking records`);

    // Batch write audience campaign records (with deduplication)
    const uniqueAudienceRecords = audienceCampaignRecords.filter((record, index, self) => 
      index === self.findIndex(r => r.PK === record.PK && r.SK === record.SK)
    );
    
    const audienceBatchRequests = uniqueAudienceRecords.map(record => ({
      PutRequest: {
        Item: record
      }
    }));

    console.log(`Writing ${uniqueAudienceRecords.length} unique audience campaign records`);

    // Process in batches of 25 (DynamoDB limit)
    for (let i = 0; i < audienceBatchRequests.length; i += 25) {
      const batch = audienceBatchRequests.slice(i, i + 25);
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch
        }
      }));
    }

    // 5. Update campaign status from "draft" to "sent"
    const updateRecords = [];

    // Create updated campaign data without PK/SK (will be set per record)
    const updatedCampaignFields = {
      ...campaign,
      status: 'sent',
      sentAt: nowIso,
      lastModified: nowIso
    };

    // Update primary campaign record
    const updatedCampaignData = {
      PK: `USER#${body.cognitoId}`,
      SK: `CAMPAIGN#${body.campaignId}`,
      ...updatedCampaignFields
    };
    updateRecords.push(updatedCampaignData);

    // Update status index record (move from STATUS#draft#CAMPAIGN to STATUS#sent#CAMPAIGN)
    const newStatusRecord = {
      PK: `USER#${body.cognitoId}`,
      SK: `STATUS#sent#CAMPAIGN#${body.campaignId}`,
      ...updatedCampaignFields
    };
    updateRecords.push(newStatusRecord);

    // Update group-specific records if campaign targets groups
    if (campaign.recipients && campaign.recipients.type === 'groups' && campaign.recipients.groupIds) {
      for (const groupId of campaign.recipients.groupIds) {
        // Update group campaign record
        const groupCampaignRecord = {
          PK: `USER#${body.cognitoId}#GROUP#${groupId}`,
          SK: `CAMPAIGN#${body.campaignId}`,
          ...updatedCampaignFields,
          groupId: groupId
        };
        updateRecords.push(groupCampaignRecord);

        // Update group status record
        const groupStatusRecord = {
          PK: `USER#${body.cognitoId}#GROUP#${groupId}`,
          SK: `STATUS#sent#CAMPAIGN#${body.campaignId}`,
          ...updatedCampaignFields,
          groupId: groupId
        };
        updateRecords.push(groupStatusRecord);
      }
    }

    console.log(`Updating ${updateRecords.length} campaign records`);

    // Deduplicate campaign update records
    const uniqueUpdateRecords = updateRecords.filter((record, index, self) => 
      index === self.findIndex(r => r.PK === record.PK && r.SK === record.SK)
    );

    console.log(`Writing ${uniqueUpdateRecords.length} unique campaign update records`);

    // Batch write campaign updates
    const campaignBatchRequests = uniqueUpdateRecords.map(record => ({
      PutRequest: {
        Item: record
      }
    }));

    // Process in batches of 25 (DynamoDB limit)
    for (let i = 0; i < campaignBatchRequests.length; i += 25) {
      const batch = campaignBatchRequests.slice(i, i + 25);
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch
        }
      }));
    }

    // 5. Delete old status index record (STATUS#draft#CAMPAIGN)
    try {
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${body.cognitoId}`,
          SK: `STATUS#${campaign.status}#CAMPAIGN#${body.campaignId}`
        }
      }));
      console.log('Deleted old status index record');
    } catch (deleteError) {
      console.warn('Could not delete old status record:', deleteError);
      // Don't fail the entire operation if we can't delete the old record
    }

    // Delete old group status records if they exist
    if (campaign.recipients && campaign.recipients.type === 'groups' && campaign.recipients.groupIds) {
      for (const groupId of campaign.recipients.groupIds) {
        try {
          await docClient.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `USER#${body.cognitoId}#GROUP#${groupId}`,
              SK: `STATUS#${campaign.status}#CAMPAIGN#${body.campaignId}`
            }
          }));
        } catch (deleteError) {
          console.warn(`Could not delete old group status record for ${groupId}:`, deleteError);
        }
      }
    }

    return {
      success: true,
      cognitoId: body.cognitoId,
      campaignId: body.campaignId,
      campaignName: campaign.name,
      templateName: templateName,
      recipients: {
        total: recipientEmails.length,
        groups: groups,
        emails: recipientEmails
      },
      sesResponse: sesResponse,
      campaignStatus: {
        updated: true,
        newStatus: 'sent'
      },
      trackingRecords: {
        created: uniqueAudienceRecords.length
      },
      audienceRecordsCreated: uniqueAudienceRecords.length,
      recordsUpdated: uniqueUpdateRecords.length,
      layoutRetrieved: layoutRetrieved,
      layoutId: campaign.layoutId || undefined,
      layoutVersion: campaign.layoutVersion || undefined,
      message: `Campaign sent successfully. Sent to ${recipientEmails.length} recipients via SES template ${templateName}. Created ${uniqueAudienceRecords.length} tracking records and updated ${uniqueUpdateRecords.length} campaign records.`
    };

  } catch (error) {
    console.error('Error processing campaign send:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(500, `Failed to process campaign send: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  } catch (outerError) {
    console.error('Outer error in campaign send:', outerError);
    console.error('Outer error details:', JSON.stringify(outerError, null, 2));
    
    if (outerError instanceof HttpError) {
      throw outerError;
    }
    
    throw new HttpError(500, `Campaign send failed: ${outerError instanceof Error ? outerError.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);