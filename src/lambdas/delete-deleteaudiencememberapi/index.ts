import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAMES = {
  AUDIENCE: process.env.AUDIENCE_TABLE_NAME || 'audience'
} as const;

interface DeleteAudienceResponse {
  success: boolean;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<DeleteAudienceResponse> => {
  try {
    const userId = event.pathParameters?.userId || event.queryStringParameters?.userId;
    const email = event.pathParameters?.email || event.queryStringParameters?.email;

    if (!userId) {
      throw new Error('userId is required');
    }
    if (!email) {
      throw new Error('email is required');
    }

    const cmd = new DeleteCommand({
      TableName: TABLE_NAMES.AUDIENCE,
      Key: { userId, email },
      ConditionExpression: 'attribute_exists(#userId) AND attribute_exists(#email)',
      ExpressionAttributeNames: { '#userId': 'userId', '#email': 'email' }
    });

    await docClient.send(cmd);

    return { success: true, message: 'Audience member deleted' };
  } catch (error) {
    console.error('Error deleting audience member:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('ConditionalCheckFailedException')) {
      return { success: false, message: 'Audience member not found' };
    }
    throw new Error(`Failed to delete audience member: ${message}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
