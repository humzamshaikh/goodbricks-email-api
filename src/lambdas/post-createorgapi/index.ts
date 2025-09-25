import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface CreateOrgRequest {
  userId: string; // Cognito user ID
  orgName: string;
  activeSubscribers: number;
  description?: string;
  website?: string;
  senderEmail?: string;
  address?: string;
  phone?: string;
}

interface CreateOrgResponse {
  success: boolean;
  orgMetadata?: any;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<CreateOrgResponse> => {
  const body = event.body ? JSON.parse(event.body) as CreateOrgRequest : undefined;
  
  if (!body) {
    throw new HttpError(400, 'Request body is required');
  }

  // Validate required fields
  if (!body.userId || typeof body.userId !== 'string') {
    throw new HttpError(400, 'userId is required and must be a string');
  }

  if (!body.orgName || typeof body.orgName !== 'string') {
    throw new HttpError(400, 'orgName is required and must be a string');
  }

  if (typeof body.activeSubscribers !== 'number' || body.activeSubscribers < 0) {
    throw new HttpError(400, 'activeSubscribers is required and must be a non-negative number');
  }

  // Validate email format if provided
  if (body.senderEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.senderEmail)) {
      throw new HttpError(400, 'Invalid sender email format');
    }
  }

  try {
    const nowIso = new Date().toISOString();
    
    // Create the organization metadata item
    const orgItem = {
      PK: `USER#${body.userId}`,
      SK: 'ORGMETADATA',
      userId: body.userId,
      orgName: body.orgName,
      activeSubscribers: body.activeSubscribers,
      description: body.description || '',
      website: body.website || '',
      senderEmail: body.senderEmail || '',
      address: body.address || '',
      phone: body.phone || '',
      createdAt: nowIso,
      lastModified: nowIso
    };

    // Put the organization metadata into DynamoDB
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: orgItem,
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    }));

    return { 
      success: true, 
      orgMetadata: orgItem,
      message: 'Organization metadata created successfully' 
    };

  } catch (error) {
    console.error('Error creating organization metadata:', error);
    
    // Handle conditional check failure (organization metadata already exists)
    if (error instanceof Error && error.message.includes('ConditionalCheckFailedException')) {
      throw new HttpError(409, `Organization metadata already exists for user: ${body.userId}`);
    }

    throw new HttpError(500, `Failed to create organization metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);