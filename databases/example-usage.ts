/**
 * Example usage of the database client in your lambda functions
 * This shows how to connect to the deployed DynamoDB tables
 */

import { docClient, TABLE_NAMES } from './database-client.js';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

// Example: Get an email template
export async function getEmailTemplate(templateId: string, version: number = 1) {
  try {
    const command = new GetCommand({
      TableName: TABLE_NAMES.EMAIL_TEMPLATES,
      Key: {
        id: templateId,
        version: version
      }
    });

    const result = await docClient.send(command);
    return result.Item;
  } catch (error) {
    console.error('Error getting email template:', error);
    throw error;
  }
}

// Example: Create an email template
export async function createEmailTemplate(template: any) {
  try {
    const command = new PutCommand({
      TableName: TABLE_NAMES.EMAIL_TEMPLATES,
      Item: {
        ...template,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      }
    });

    await docClient.send(command);
    return template;
  } catch (error) {
    console.error('Error creating email template:', error);
    throw error;
  }
}

// Example: Get templates by category
export async function getTemplatesByCategory(category: string) {
  try {
    const command = new QueryCommand({
      TableName: TABLE_NAMES.EMAIL_TEMPLATES,
      IndexName: 'category-index',
      KeyConditionExpression: 'category = :category',
      ExpressionAttributeValues: {
        ':category': category
      }
    });

    const result = await docClient.send(command);
    return result.Items || [];
  } catch (error) {
    console.error('Error getting templates by category:', error);
    throw error;
  }
}

// Example: Record email history
export async function recordEmailHistory(emailData: any) {
  try {
    const command = new PutCommand({
      TableName: TABLE_NAMES.EMAIL_HISTORY,
      Item: {
        ...emailData,
        id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
      }
    });

    await docClient.send(command);
    return emailData;
  } catch (error) {
    console.error('Error recording email history:', error);
    throw error;
  }
}

// Example: Get email history by recipient
export async function getEmailHistoryByRecipient(recipientEmail: string) {
  try {
    const command = new QueryCommand({
      TableName: TABLE_NAMES.EMAIL_HISTORY,
      IndexName: 'recipient-index',
      KeyConditionExpression: 'recipientEmail = :email',
      ExpressionAttributeValues: {
        ':email': recipientEmail
      },
      ScanIndexForward: false // Sort by timestamp descending
    });

    const result = await docClient.send(command);
    return result.Items || [];
  } catch (error) {
    console.error('Error getting email history by recipient:', error);
    throw error;
  }
}
