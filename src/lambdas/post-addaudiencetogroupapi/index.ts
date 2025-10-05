import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface AddAudienceToGroupRequest {
  cognitoId: string; // Cognito user ID
  groupId: string; // Group ID
  emails: string[]; // Array of specific email addresses to add to the group
}

interface AddAudienceToGroupResponse {
  success: boolean;
  cognitoId?: string;
  groupId?: string;
  membersProcessed?: number;
  membersSkipped?: number;
  message?: string;
  details?: {
    processedEmails?: string[];
    skippedEmails?: string[];
  };
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<AddAudienceToGroupResponse> => {
  const body = event.body ? JSON.parse(event.body) as AddAudienceToGroupRequest : undefined;
  
  if (!body) {
    throw new HttpError(400, 'Request body is required');
  }

  // Validate required fields
  if (!body.cognitoId || typeof body.cognitoId !== 'string') {
    throw new HttpError(400, 'cognitoId is required and must be a string');
  }

  if (!body.groupId || typeof body.groupId !== 'string') {
    throw new HttpError(400, 'groupId is required and must be a string');
  }

  if (!body.emails || !Array.isArray(body.emails) || body.emails.length === 0) {
    throw new HttpError(400, 'emails is required and must be a non-empty array');
  }

  // Validate email format for all emails
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const email of body.emails) {
    if (typeof email !== 'string' || !emailRegex.test(email)) {
      throw new HttpError(400, `Invalid email format: ${email}`);
    }
  }

  try {
    const nowIso = new Date().toISOString();
    const processedEmails: string[] = [];
    const skippedEmails: string[] = [];
    let processedCount = 0;

    // Process each email individually
    for (const email of body.emails) {
      try {
        // Step 1: Get the audience member details
        const audienceQuery = {
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND SK = :sk',
          ExpressionAttributeValues: {
            ':pk': `USER#${body.cognitoId}`,
            ':sk': `AUDIENCE#${email}`
          }
        };

        const audienceResult = await docClient.send(new QueryCommand(audienceQuery));
        const audienceMember = audienceResult.Items?.[0];

        if (!audienceMember) {
          skippedEmails.push(email);
          continue;
        }

        // Step 2: Create Group Association Record: USER#{cognitoId}#GROUP#{groupId} + AUDIENCE#{email}
        const groupAssociationRecord = {
          PK: `USER#${body.cognitoId}#GROUP#${body.groupId}`,
          SK: `AUDIENCE#${email}`,
          userId: body.cognitoId,
          email: email,
          firstName: audienceMember.firstName || '',
          lastName: audienceMember.lastName || '',
          tags: audienceMember.tags || [],
          organization: audienceMember.organization || '',
          entityType: 'AUDIENCE',
          createdAt: audienceMember.createdAt,
          lastModified: nowIso
        };

        // Step 3: Create Member Group Association Record: USER#{cognitoId}#AUDIENCE#{email} + GROUP#{groupId}
        const memberGroupRecord = {
          PK: `USER#${body.cognitoId}#AUDIENCE#${email}`,
          SK: `GROUP#${body.groupId}`,
          groupId: body.groupId,
          addedAt: nowIso
        };

        // Step 4: Execute all operations in parallel
        const results = await Promise.allSettled([
          // Create group association record
          docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: groupAssociationRecord,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          })),
          // Create member group record
          docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: memberGroupRecord,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          }))
        ]);

        // Check if any operations failed
        const failedResults = results.filter(result => result.status === 'rejected');
        if (failedResults.length > 0) {
          const conditionalFailures = failedResults.filter(result => 
            result.status === 'rejected' && 
            result.reason && 
            (result.reason.message?.includes('ConditionalCheckFailedException') || 
             (result.reason as any).__type?.includes('ConditionalCheckFailedException'))
          );
          
          if (conditionalFailures.length === failedResults.length) {
            // All failures are conditional check failures - member already in group
            skippedEmails.push(email);
            continue;
          } else {
            // Some other error occurred
            throw new Error(`Failed to add member ${email} to group`);
          }
        }

        processedCount++;
        processedEmails.push(email);

      } catch (error) {
        console.error(`Error processing email ${email}:`, error);
        // If it's a conditional check failure, the member is already in the group
        if (error instanceof Error && error.message.includes('ConditionalCheckFailedException')) {
          skippedEmails.push(email);
        } else {
          throw error; // Re-throw unexpected errors
        }
      }
    }

    // Step 5: Update Group Metadata - Increment memberCount
    if (processedCount > 0) {
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${body.cognitoId}`,
          SK: `GROUPMETADATA#${body.groupId}`
        },
        UpdateExpression: 'ADD memberCount :increment SET lastModified = :lastModified',
        ExpressionAttributeValues: {
          ':increment': processedCount,
          ':lastModified': nowIso
        }
      }));
    }

    return {
      success: true,
      cognitoId: body.cognitoId,
      groupId: body.groupId,
      membersProcessed: processedCount,
      membersSkipped: skippedEmails.length,
      message: `Successfully added ${processedCount} audience members to group ${body.groupId}. ${skippedEmails.length} emails were skipped.`,
      details: {
        processedEmails,
        skippedEmails
      }
    };

  } catch (error) {
    console.error('Error adding audience to group:', error);
    
    throw new HttpError(500, `Failed to add audience to group: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);








