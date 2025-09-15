import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAMES = {
  AUDIENCE: process.env.AUDIENCE_TABLE_NAME || 'audience'
} as const;

interface CreateAudienceGroupRequest {
  group: string; // tag to apply
  emails: string[]; // list of audience emails
}

interface CreateAudienceGroupResponse {
  success: boolean;
  appliedCount?: number;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<CreateAudienceGroupResponse> => {
  try {
    const userId = event.pathParameters?.userId || (event.body ? JSON.parse(event.body).userId : undefined);
    if (!userId) {
      throw new Error('userId is required');
    }
    const body = event.body ? JSON.parse(event.body) as CreateAudienceGroupRequest : undefined;
    if (!body || !body.group || !Array.isArray(body.emails) || body.emails.length === 0) {
      throw new Error('group and emails are required');
    }

    // BatchWrite with Update is not supported; we'll do small batches of 25 via transactional-style loop
    let applied = 0;
    const chunkSize = 25;
    for (let i = 0; i < body.emails.length; i += chunkSize) {
      const chunk = body.emails.slice(i, i + chunkSize);
      // We cannot update in BatchWrite; instead, we perform a series of Update commands.
      // To keep simple and efficient, we use parallel sends per chunk.
      await Promise.all(
        chunk.map(email =>
          docClient.send(new UpdateCommand({
            TableName: TABLE_NAMES.AUDIENCE,
            Key: { userId, email },
            UpdateExpression: 'SET #tags = list_append(if_not_exists(#tags, :empty), :newTag), #lastModified = :now',
            ExpressionAttributeNames: { '#tags': 'tags', '#lastModified': 'lastModified' },
            ExpressionAttributeValues: { ':newTag': [body.group], ':empty': [], ':now': new Date().toISOString() },
            ReturnValues: 'NONE'
          }))
        )
      );
      applied += chunk.length;
    }

    return { success: true, appliedCount: applied, message: 'Group tag applied to audience emails' };
  } catch (error) {
    console.error('Error creating audience group:', error);
    throw new Error(`Failed to create audience group: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
