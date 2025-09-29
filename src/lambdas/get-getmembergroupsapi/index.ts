import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface GetMemberGroupsRequest {
  cognitoId: string;
  email: string;
}

interface MemberGroup {
  groupId: string;
  addedAt: string; // When the member was added to this group (from lastModified)
}

interface MemberGroupsResponse {
  success: boolean;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  groups: MemberGroup[];
  totalGroups: number;
  message?: string;
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<MemberGroupsResponse> => {
  try {
    // Parse request body to get cognitoId and email
    const body = event.body ? JSON.parse(event.body) : {};
    const cognitoId = body.cognitoId;
    const email = body.email;
    
    if (!cognitoId) {
      throw new Error('cognitoId is required in request body');
    }

    if (!email) {
      throw new Error('email is required in request body');
    }

    console.log(`Getting groups for member: ${email} (user: ${cognitoId})`);

    // Query using new PK/SK pattern
    const queryParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${cognitoId}#AUDIENCE#${email}`,
        ':sk': 'GROUP'
      }
    };

    const result = await docClient.send(new QueryCommand(queryParams));

    console.log(`Found ${result.Items?.length || 0} group records for member: ${email}`);

    // Map query results to MemberGroup objects
    const groups: MemberGroup[] = (result.Items || []).map(item => ({
      groupId: item.groupId || 'unknown',
      addedAt: item.lastModified || item.createdAt || new Date().toISOString()
    }));

    // Get member details from the first item (if any) or use defaults
    const firstItem = result.Items?.[0];
    const userId = firstItem?.userId || cognitoId;
    const firstName = firstItem?.firstName || 'Unknown';
    const lastName = firstItem?.lastName || 'Unknown';

    console.log(`Member ${email} belongs to ${groups.length} groups`);

    return {
      success: true,
      userId,
      email,
      firstName,
      lastName,
      groups,
      totalGroups: groups.length,
      message: `Found ${groups.length} groups for member: ${email}`
    };

  } catch (error) {
    console.error('Error fetching member groups:', error);
    throw new Error(`Failed to fetch member groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const handler = createHttpHandler(handlerLogic);
