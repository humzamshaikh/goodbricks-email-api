import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface AddAudienceToGroupRequest {
  userId: string; // Cognito user ID (e.g., "cognito-user-icsd")
  groupId: string; // Group ID (e.g., "vip-members")
  emails: string[]; // Array of specific email addresses to add to the group
}

interface AddAudienceToGroupResponse {
  success: boolean;
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
  if (!body.userId || typeof body.userId !== 'string') {
    throw new HttpError(400, 'userId is required and must be a string');
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
    // Step 1: Query all audience members for the user
    const queryParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${body.userId}`,
        ':sk': 'AUDIENCE#'
      }
    };

    const queryResult = await docClient.send(new QueryCommand(queryParams));
    const allAudienceMembers = queryResult.Items || [];

    if (allAudienceMembers.length === 0) {
      return {
        success: true,
        groupId: body.groupId,
        membersProcessed: 0,
        membersSkipped: body.emails.length,
        message: 'No audience members found for this user',
        details: {
          processedEmails: [],
          skippedEmails: body.emails
        }
      };
    }

    // Filter audience members to only include requested emails
    const requestedMembers = allAudienceMembers.filter(member => 
      body.emails.includes(member.email)
    );

    const processedEmails: string[] = [];
    const skippedEmails: string[] = body.emails.filter(email => 
      !allAudienceMembers.some(member => member.email === email)
    );

    if (requestedMembers.length === 0) {
      return {
        success: true,
        groupId: body.groupId,
        membersProcessed: 0,
        membersSkipped: body.emails.length,
        message: 'No matching audience members found for the provided emails',
        details: {
          processedEmails: [],
          skippedEmails: body.emails
        }
      };
    }

    // Step 2: Process each requested audience member
    let processedCount = 0;
    const batchSize = 25; // DynamoDB batch limit

    for (let i = 0; i < requestedMembers.length; i += batchSize) {
      const batch = requestedMembers.slice(i, i + batchSize);
      
      // Process batch in parallel
      await Promise.all(batch.map(async (member) => {
        // Step 2a: Create new group-specific item
        const groupItem = {
          PK: `USER#${body.userId}#GROUP#${body.groupId}`,
          SK: member.SK, // Same SK as original (AUDIENCE#{email})
          entityType: 'AUDIENCE',
          userId: member.userId,
          email: member.email,
          firstName: member.firstName,
          lastName: member.lastName,
          tags: member.tags || [],
          organization: member.organization || '',
          createdAt: member.createdAt,
          lastModified: new Date().toISOString()
        };

        // Step 2b: Update original item to add group tag
        const currentTags = member.tags || [];
        const updatedTags = [...currentTags, body.groupId];

        // Execute both operations in parallel
        await Promise.all([
          // Create group-specific item
          docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: groupItem,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          })),
          // Update original item with new tag
          docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: member.PK,
              SK: member.SK
            },
            UpdateExpression: 'SET #tags = :tags, #lastModified = :lastModified',
            ExpressionAttributeNames: {
              '#tags': 'tags',
              '#lastModified': 'lastModified'
            },
            ExpressionAttributeValues: {
              ':tags': updatedTags,
              ':lastModified': new Date().toISOString()
            }
          }))
        ]);

        processedCount++;
        processedEmails.push(member.email);
      }));
    }

    return {
      success: true,
      groupId: body.groupId,
      membersProcessed: processedCount,
      membersSkipped: skippedEmails.length,
      message: `Successfully added ${processedCount} audience members to group ${body.groupId}. ${skippedEmails.length} emails were not found.`,
      details: {
        processedEmails,
        skippedEmails
      }
    };

  } catch (error) {
    console.error('Error adding audience to group:', error);
    
    // Handle conditional check failure (group item already exists)
    if (error instanceof Error && error.message.includes('ConditionalCheckFailedException')) {
      throw new HttpError(409, `Group items already exist for user: ${body.userId} and group: ${body.groupId}`);
    }

    throw new HttpError(500, `Failed to add audience to group: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);








