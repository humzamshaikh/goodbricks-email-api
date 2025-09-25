import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface MemberGroup {
  groupId: string;
  addedAt: string; // When the member was added to this group (from lastModified)
}

interface MemberGroupsResponse {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  groups: MemberGroup[];
  totalGroups: number;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<MemberGroupsResponse> => {
  try {
    const userId = event.pathParameters?.userId || event.queryStringParameters?.userId;
    const email = event.pathParameters?.email || event.queryStringParameters?.email;
    
    if (!userId) {
      throw new Error('userId is required');
    }

    if (!email) {
      throw new Error('email is required');
    }

    const getParams = {
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `AUDIENCE#${email}`
      }
    };

    const result = await docClient.send(new GetCommand(getParams));

    if (!result.Item) {
      throw new Error('Audience member not found');
    }

    // Extract group IDs from the tags array
    const tags = result.Item.tags || [];
    const groupIds = tags.filter((tag: string) => 
      // Filter for group IDs (you might want to adjust this logic based on your naming convention)
      tag && typeof tag === 'string'
    );

    // Map group IDs to MemberGroup objects
    const groups: MemberGroup[] = groupIds.map((groupId: string) => ({
      groupId: groupId,
      addedAt: result.Item!.lastModified // Using lastModified as proxy for when added to group
    }));

    const response: MemberGroupsResponse = {
      userId: result.Item.userId,
      email: result.Item.email,
      firstName: result.Item.firstName,
      lastName: result.Item.lastName,
      groups: groups,
      totalGroups: groups.length
    };

    return response;

  } catch (error) {
    console.error('Error fetching member groups:', error);
    throw new Error(`Failed to fetch member groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
