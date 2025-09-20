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

// Single table name (available after CDK deployment)
export const TABLE_NAMES = {
  MAIN_TABLE: process.env.MAIN_TABLE_NAME || 'goodbricks-email-main'
} as const;

// Export for easy importing in lambda functions
export { docClient as dynamoClient };
export default docClient;
