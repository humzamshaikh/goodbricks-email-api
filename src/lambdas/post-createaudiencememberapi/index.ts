import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface CreateAudienceMemberRequest {
  userId: string; // Cognito user ID
  email: string;
  firstName: string;
  lastName: string;
  tags?: string[]; // Optional tags (default: empty array)
  organization?: string; // Optional organization name
}

interface CreateAudienceMemberResponse {
  success: boolean;
  audienceMember?: any;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<CreateAudienceMemberResponse> => {
  const body = event.body ? JSON.parse(event.body) as CreateAudienceMemberRequest : undefined;
  
  if (!body) {
    throw new HttpError(400, 'Request body is required');
  }

  // Validate required fields
  if (!body.userId || typeof body.userId !== 'string') {
    throw new HttpError(400, 'userId is required and must be a string');
  }

  if (!body.email || typeof body.email !== 'string') {
    throw new HttpError(400, 'email is required and must be a string');
  }

  if (!body.firstName || typeof body.firstName !== 'string') {
    throw new HttpError(400, 'firstName is required and must be a string');
  }

  if (!body.lastName || typeof body.lastName !== 'string') {
    throw new HttpError(400, 'lastName is required and must be a string');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    throw new HttpError(400, 'Invalid email format');
  }

  try {
    const nowIso = new Date().toISOString();
    
    // Create the audience member item
    const audienceItem = {
      PK: `USER#${body.userId}`,
      SK: `AUDIENCE#${body.email}`,
      entityType: 'AUDIENCE',
      userId: body.userId,
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      tags: body.tags || [],
      organization: body.organization || '',
      createdAt: nowIso,
      lastModified: nowIso
    };

    // Put the audience member into DynamoDB
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: audienceItem,
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    }));

    return { 
      success: true, 
      audienceMember: audienceItem,
      message: 'Audience member created successfully' 
    };

  } catch (error) {
    console.error('Error creating audience member:', error);
    
    // Handle conditional check failure (audience member already exists)
    if (error instanceof Error && error.message.includes('ConditionalCheckFailedException')) {
      throw new HttpError(409, `Audience member already exists: ${body.email}`);
    }

    throw new HttpError(500, `Failed to create audience member: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
