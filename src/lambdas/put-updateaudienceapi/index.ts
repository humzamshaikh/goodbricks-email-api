import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface UpdateAudienceRequest {
  cognitoId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  tags?: string[]; // full replacement
}

interface UpdateAudienceResponse {
  success: boolean;
  cognitoId?: string;
  email?: string;
  audience?: any;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<UpdateAudienceResponse> => {
  const body = event.body ? JSON.parse(event.body) as UpdateAudienceRequest : undefined;
  
  if (!body) {
    throw new HttpError(400, 'Request body is required');
  }

  if (!body.cognitoId || typeof body.cognitoId !== 'string') {
    throw new HttpError(400, 'cognitoId is required and must be a string');
  }

  if (!body.email || typeof body.email !== 'string') {
    throw new HttpError(400, 'email is required and must be a string');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    throw new HttpError(400, 'Invalid email format');
  }

  // Check if at least one field to update is provided
  const hasUpdates = body.firstName !== undefined || body.lastName !== undefined || body.tags !== undefined;
  if (!hasUpdates) {
    throw new HttpError(400, 'At least one field (firstName, lastName, or tags) must be provided for update');
  }

  try {
    const nowIso = new Date().toISOString();
    
    // Build dynamic UpdateExpression
    const setExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Always update lastModified
    setExpressions.push('#lastModified = :lastModified');
    expressionAttributeNames['#lastModified'] = 'lastModified';
    expressionAttributeValues[':lastModified'] = nowIso;

    // Add fields to update if provided
    if (body.firstName !== undefined) {
      setExpressions.push('#firstName = :firstName');
      expressionAttributeNames['#firstName'] = 'firstName';
      expressionAttributeValues[':firstName'] = body.firstName;
    }

    if (body.lastName !== undefined) {
      setExpressions.push('#lastName = :lastName');
      expressionAttributeNames['#lastName'] = 'lastName';
      expressionAttributeValues[':lastName'] = body.lastName;
    }

    if (body.tags !== undefined) {
      setExpressions.push('#tags = :tags');
      expressionAttributeNames['#tags'] = 'tags';
      expressionAttributeValues[':tags'] = body.tags;
    }

    const updateCommand = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { 
        PK: `USER#${body.cognitoId}`,
        SK: `AUDIENCE#${body.email}`
      },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
    });

    const result = await docClient.send(updateCommand);
    
    if (!result.Attributes) {
      throw new HttpError(404, 'Audience member not found');
    }

    return { 
      success: true, 
      cognitoId: body.cognitoId,
      email: body.email,
      audience: result.Attributes, 
      message: 'Audience member updated successfully' 
    };

  } catch (error) {
    console.error('Error updating audience member:', error);
    
    // Handle conditional check failure (audience member not found)
    if (error instanceof Error && 
        (error.message.includes('ConditionalCheckFailedException') || 
         (error as any).__type?.includes('ConditionalCheckFailedException'))) {
      throw new HttpError(404, `Audience member not found: ${body.email}`);
    }

    throw new HttpError(500, `Failed to update audience member: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);