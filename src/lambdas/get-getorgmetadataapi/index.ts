import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface GetOrgMetadataRequest {
  cognitoId: string;
}

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
  success: boolean;
  orgMetadata: OrgMetadata[];
  totalCount: number;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<OrgMetadataResponse> => {
  try {
    // Parse request body to get cognitoId
    const body = event.body ? JSON.parse(event.body) : {};
    const cognitoId = body.cognitoId;
    
    if (!cognitoId) {
      throw new Error('cognitoId is required in request body');
    }

    console.log(`Getting organization metadata for user: ${cognitoId}`);

    // Query using new PK/SK pattern
    const queryParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${cognitoId}`,
        ':sk': 'ORGMETADATA'
      }
    };

    const result = await docClient.send(new QueryCommand(queryParams));

    console.log(`Found ${result.Items?.length || 0} organization metadata records for user: ${cognitoId}`);

    // Map query results to OrgMetadata objects
    const orgMetadata: OrgMetadata[] = (result.Items || []).map(item => ({
      userId: item.userId,
      orgName: item.orgName,
      activeSubscribers: item.activeSubscribers || 0,
      description: item.description || '',
      website: item.website || '',
      senderEmail: item.senderEmail || '',
      address: item.address || '',
      phone: item.phone || '',
      createdAt: item.createdAt,
      lastModified: item.lastModified
    }));

    console.log(`Returning ${orgMetadata.length} organization metadata records`);

    return {
      success: true,
      orgMetadata,
      totalCount: orgMetadata.length,
      message: `Found ${orgMetadata.length} organization metadata records for user: ${cognitoId}`
    };

  } catch (error) {
    console.error('Error fetching organization metadata:', error);
    throw new Error(`Failed to fetch organization metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
