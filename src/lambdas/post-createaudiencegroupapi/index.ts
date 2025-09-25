import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface CreateAudienceGroupRequest {
  userId: string; // Cognito user ID
  group: string; // Group identifier (e.g., "vip-members", "newsletter-subscribers")
  emails: string[]; // Array of email addresses to add to the group
}

interface CreateAudienceGroupResponse {
  success: boolean;
  processedEmails: string[];
  skippedEmails: string[];
  totalProcessed: number;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<CreateAudienceGroupResponse> => {
  const body = event.body ? JSON.parse(event.body) as CreateAudienceGroupRequest : undefined;
  
  if (!body) {
    throw new HttpError(400, 'Request body is required');
  }

  // Validate required fields
  if (!body.userId || typeof body.userId !== 'string') {
    throw new HttpError(400, 'userId is required and must be a string');
  }

  if (!body.group || typeof body.group !== 'string') {
    throw new HttpError(400, 'group is required and must be a string');
  }

  if (!Array.isArray(body.emails) || body.emails.length === 0) {
    throw new HttpError(400, 'emails is required and must be a non-empty array');
  }

  // Validate email formats
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalidEmails = body.emails.filter(email => !emailRegex.test(email));
  if (invalidEmails.length > 0) {
    throw new HttpError(400, `Invalid email format(s): ${invalidEmails.join(', ')}`);
  }

  try {
    const processedEmails: string[] = [];
    const skippedEmails: string[] = [];

    // Query all audience members for the user
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

    // Filter to only the requested emails
    const requestedMembers = allAudienceMembers.filter(member => 
      body.emails.includes(member.email)
    );

    // Process each requested member
    for (const member of requestedMembers) {
      try {
        // Check if the group is already in the tags
        const currentTags = member.tags || [];
        if (currentTags.includes(body.group)) {
          skippedEmails.push(member.email);
          continue;
        }

        // Add the group to the tags array
        await docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: member.PK,
            SK: member.SK
          },
          UpdateExpression: 'SET #tags = list_append(if_not_exists(#tags, :empty_list), :group_list), lastModified = :now',
          ExpressionAttributeNames: {
            '#tags': 'tags'
          },
          ExpressionAttributeValues: {
            ':group_list': [body.group],
            ':empty_list': [],
            ':now': new Date().toISOString()
          },
          ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
        }));

        processedEmails.push(member.email);

      } catch (error) {
        console.error(`Error updating member ${member.email}:`, error);
        skippedEmails.push(member.email);
      }
    }

    // Check for emails that weren't found in the audience
    const foundEmails = requestedMembers.map(member => member.email);
    const notFoundEmails = body.emails.filter(email => !foundEmails.includes(email));
    skippedEmails.push(...notFoundEmails);

    return {
      success: true,
      processedEmails,
      skippedEmails,
      totalProcessed: processedEmails.length,
      message: `Successfully processed ${processedEmails.length} emails. Skipped ${skippedEmails.length} emails.`
    };

  } catch (error) {
    console.error('Error creating audience group:', error);
    throw new HttpError(500, `Failed to create audience group: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
