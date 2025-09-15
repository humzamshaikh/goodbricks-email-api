import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-2'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-2'
});

// Table and bucket names
const EMAIL_TEMPLATES_TABLE = process.env.EMAIL_TEMPLATES_TABLE_NAME || 'email-templates';
const TEMPLATES_BUCKET = process.env.TEMPLATES_BUCKET_NAME || 'gb-email-templates-900546257868-us-west-2';
const BRANDED_TEMPLATES_BUCKET = process.env.BRANDED_TEMPLATES_BUCKET_NAME || 'gb-branded-templates-900546257868-us-west-2';

// Types
interface EmailTemplate {
  id: string;
  version: number;
  name: string;
  category: string;
  subject: string;
  description: string;
  isActive: string;
  createdAt: string;
  updatedAt: string;
  s3Key: string;
  tags: string[];
  content?: string; // Added when includeContent=true
}

interface QueryParams {
  category?: string;
  search?: string;
  includeContent?: boolean;
  limit?: number;
  activeOnly?: boolean;
}

// Helper function to fetch template content from S3
async function fetchTemplateContent(s3Key: string, bucketName: string): Promise<string | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key
    });
    
    const response = await s3Client.send(command);
    const content = await response.Body?.transformToString();
    return content || null;
  } catch (error) {
    console.error(`Error fetching template content from S3 (${s3Key}):`, error);
    return null;
  }
}

// Helper function to search templates by text
function searchTemplates(templates: EmailTemplate[], searchTerm: string): EmailTemplate[] {
  const searchLower = searchTerm.toLowerCase();
  return templates.filter(template => 
    template.name.toLowerCase().includes(searchLower) ||
    template.subject.toLowerCase().includes(searchLower) ||
    template.description.toLowerCase().includes(searchLower) ||
    template.tags.some(tag => tag.toLowerCase().includes(searchLower))
  );
}

// Main handler logic
const handlerLogic = async (event: ApiGatewayEventLike) => {
  try {
    const queryParams: QueryParams = {
      category: event.queryStringParameters?.category,
      search: event.queryStringParameters?.search,
      includeContent: event.queryStringParameters?.includeContent === 'true',
      limit: event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : undefined,
      activeOnly: event.queryStringParameters?.activeOnly !== 'false' // Default to true
    };

    let templates: EmailTemplate[] = [];

    // Query templates based on parameters
    if (queryParams.category) {
      // Query by category using GSI
      const command = new QueryCommand({
        TableName: EMAIL_TEMPLATES_TABLE,
        IndexName: 'category-index',
        KeyConditionExpression: 'category = :category',
        ExpressionAttributeValues: {
          ':category': queryParams.category
        },
        ScanIndexForward: false // Sort by createdAt descending
      });

      const result = await docClient.send(command);
      templates = (result.Items as EmailTemplate[]) || [];
    } else {
      // Scan all templates
      const command = new ScanCommand({
        TableName: EMAIL_TEMPLATES_TABLE
      });

      const result = await docClient.send(command);
      templates = (result.Items as EmailTemplate[]) || [];
    }

    // Filter by active status if requested
    if (queryParams.activeOnly) {
      templates = templates.filter(template => template.isActive === 'true');
    }

    // Apply search filter if provided
    if (queryParams.search) {
      templates = searchTemplates(templates, queryParams.search);
    }

    // Sort by updatedAt descending
    templates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    // Apply limit
    if (queryParams.limit && queryParams.limit > 0) {
      templates = templates.slice(0, queryParams.limit);
    }

    // Fetch template content from S3 if requested
    if (queryParams.includeContent) {
      const contentPromises = templates.map(async (template) => {
        try {
          // Try to fetch from base templates bucket first
          let content = await fetchTemplateContent(template.s3Key, TEMPLATES_BUCKET);
          
          // If not found, try branded templates bucket
          if (!content) {
            const brandedKey = template.s3Key.replace('templates/', 'templates/').replace('.html', '_brandA.html');
            content = await fetchTemplateContent(brandedKey, BRANDED_TEMPLATES_BUCKET);
          }
          
          return {
            ...template,
            content: content || 'Template content not found'
          };
        } catch (error) {
          console.error(`Error fetching content for template ${template.id}:`, error);
          return {
            ...template,
            content: 'Error fetching template content'
          };
        }
      });

      templates = await Promise.all(contentPromises);
    }

    // Group templates by ID to get latest versions
    const templateMap = new Map<string, EmailTemplate>();
    templates.forEach(template => {
      const existing = templateMap.get(template.id);
      if (!existing || template.version > existing.version) {
        templateMap.set(template.id, template);
      }
    });

    const finalTemplates = Array.from(templateMap.values());

    return {
      success: true,
      data: {
        templates: finalTemplates,
        count: finalTemplates.length,
        query: {
          category: queryParams.category,
          search: queryParams.search,
          includeContent: queryParams.includeContent,
          limit: queryParams.limit,
          activeOnly: queryParams.activeOnly
        }
      }
    };

  } catch (error) {
    console.error('Error in get-getemailtemplatesapi:', error);
    throw error;
  }
};

export const handler = createHttpHandler(handlerLogic);