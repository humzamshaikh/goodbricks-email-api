import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface OrgMetadata {
  userId: string;
  orgName: string;
  activeSubscribers: number;
  description?: string;
  website?: string;
  senderEmail?: string;
  address?: string;
  phone?: string;
  createdAt: string;
  lastModified: string;
}

interface OrgMetadataResponse {
  orgMetadata: OrgMetadata;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<OrgMetadataResponse> => {
  try {
    const userId = event.pathParameters?.userId || event.queryStringParameters?.userId;
    
    if (!userId) {
      throw new Error('userId is required');
    }

    const getParams = {
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'ORGMETADATA'
      }
    };

    const result = await docClient.send(new GetCommand(getParams));

    if (!result.Item) {
      throw new Error('Organization metadata not found');
    }

    const orgMetadata: OrgMetadata = {
      userId: result.Item.userId,
      orgName: result.Item.orgName,
      activeSubscribers: result.Item.activeSubscribers || 0,
      description: result.Item.description || '',
      website: result.Item.website || '',
      senderEmail: result.Item.senderEmail || '',
      address: result.Item.address || '',
      phone: result.Item.phone || '',
      createdAt: result.Item.createdAt,
      lastModified: result.Item.lastModified
    };

    return {
      orgMetadata
    };

  } catch (error) {
    console.error('Error fetching organization metadata:', error);
    throw new Error(`Failed to fetch organization metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
