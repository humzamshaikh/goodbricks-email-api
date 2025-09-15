/**
 * Database Client for GoodBricks Email API
 * This client provides easy access to the DynamoDB tables deployed via CDK
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// DynamoDB Configuration
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});

export const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Table names (these will be available after CDK deployment)
export const TABLE_NAMES = {
  EMAIL_TEMPLATES: process.env.EMAIL_TEMPLATES_TABLE_NAME || 'email-templates',
  EMAIL_HISTORY: process.env.EMAIL_HISTORY_TABLE_NAME || 'email-history',
  AUDIENCE: process.env.AUDIENCE_TABLE_NAME || 'audience'
} as const;

// Export for easy importing in lambda functions
export { docClient as dynamoClient };
export default docClient;
