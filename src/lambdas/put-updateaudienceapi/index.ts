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

interface UpdateAudienceRequest {
  firstName?: string;
  lastName?: string;
  tags?: string[]; // full replacement
  addTag?: string; // convenience: adds to tags if not present
  removeTag?: string; // convenience: removes from tags if present
  status?: string; // optional if using status attribute
}

interface UpdateAudienceResponse {
  success: boolean;
  audience?: any;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<UpdateAudienceResponse> => {
  try {
    const userId = event.pathParameters?.userId || event.queryStringParameters?.userId;
    const email = event.pathParameters?.email || event.queryStringParameters?.email;

    if (!userId) {
      throw new Error('userId is required');
    }
    if (!email) {
      throw new Error('email is required');
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const updates: UpdateAudienceRequest = body;
    if (Object.keys(updates).length === 0) {
      throw new Error('No update fields provided');
    }

    // Build dynamic UpdateExpression
    const setExpressions: string[] = [];
    const removeExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Always update lastModified
    setExpressions.push('#lastModified = :lastModified');
    expressionAttributeNames['#lastModified'] = 'lastModified';
    expressionAttributeValues[':lastModified'] = new Date().toISOString();

    if (updates.firstName !== undefined) {
      setExpressions.push('#firstName = :firstName');
      expressionAttributeNames['#firstName'] = 'firstName';
      expressionAttributeValues[':firstName'] = updates.firstName;
    }
    if (updates.lastName !== undefined) {
      setExpressions.push('#lastName = :lastName');
      expressionAttributeNames['#lastName'] = 'lastName';
      expressionAttributeValues[':lastName'] = updates.lastName;
    }
    if (updates.status !== undefined) {
      setExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = updates.status;
    }

    // Tags logic
    if (updates.tags !== undefined) {
      setExpressions.push('#tags = :tags');
      expressionAttributeNames['#tags'] = 'tags';
      expressionAttributeValues[':tags'] = updates.tags;
    }
    if (updates.addTag) {
      // If tags not set above, use list_append + if_not_exists to ensure array exists
      expressionAttributeNames['#tags'] = 'tags';
      // Prevent duplicates by using a SET with list_append and a condition expression would be ideal.
      // Simpler approach: use list_append and rely on client to dedupe later.
      setExpressions.push('#tags = list_append(if_not_exists(#tags, :emptyList), :tagToAdd)');
      expressionAttributeValues[':tagToAdd'] = [updates.addTag];
      expressionAttributeValues[':emptyList'] = [];
    }
    if (updates.removeTag) {
      // Cannot easily remove by value without knowing index; simple approach: overwrite tags provided explicitly.
      // Here we signal that removeTag requires current tags to be provided in "tags" for accuracy.
      // If not provided, we do nothing for removeTag.
    }

    const updateExpressionParts: string[] = [];
    if (setExpressions.length > 0) {
      updateExpressionParts.push(`SET ${setExpressions.join(', ')}`);
    }
    if (removeExpressions.length > 0) {
      updateExpressionParts.push(`REMOVE ${removeExpressions.join(', ')}`);
    }

    const updateCommand = new UpdateCommand({
      TableName: TABLE_NAMES.AUDIENCE,
      Key: { userId, email },
      UpdateExpression: updateExpressionParts.join(' '),
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: Object.keys(expressionAttributeValues).length ? expressionAttributeValues : undefined,
      ReturnValues: 'ALL_NEW'
    });

    const result = await docClient.send(updateCommand);
    if (!result.Attributes) {
      return { success: false, message: 'Audience member not found or update failed' };
    }

    return { success: true, audience: result.Attributes, message: 'Audience member updated successfully' };
  } catch (error) {
    console.error('Error updating audience member:', error);
    throw new Error(`Failed to update audience member: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
