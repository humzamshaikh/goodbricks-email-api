import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { 
  mockEmailTemplates, 
  mockEmailHistory, 
  mockEmailAnalytics, 
  mockS3Templates, 
  mockBrandedTemplates,
  mockAudience
} from './mock-data.js';

const region = process.env.AWS_REGION || 'us-west-1';
const accountId = process.env.AWS_ACCOUNT_ID || '900546257868';

async function main() {
  const s3 = new S3Client({ region });
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

  const templatesBucket = `gb-email-templates-${accountId}-${region}`;
  const brandedBucket = `gb-branded-templates-${accountId}-${region}`;

  console.log('🌱 Starting database seeding...');

  // Upload S3 templates
  console.log('📁 Uploading S3 templates...');
  for (const template of mockS3Templates) {
    await s3.send(new PutObjectCommand({ 
      Bucket: templatesBucket, 
      Key: template.key, 
      Body: template.body, 
      ContentType: 'text/html' 
    }));
  }

  // Upload branded templates
  console.log('🎨 Uploading branded templates...');
  for (const template of mockBrandedTemplates) {
    await s3.send(new PutObjectCommand({ 
      Bucket: brandedBucket, 
      Key: template.key, 
      Body: template.body, 
      ContentType: 'text/html' 
    }));
  }

  // Seed Email Templates Table
  console.log('📧 Seeding email templates...');
  for (const template of mockEmailTemplates) {
    await ddb.send(new PutCommand({ 
      TableName: 'email-templates', 
      Item: template 
    }));
  }

  // Seed Email History Table
  console.log('📊 Seeding email history...');
  for (const history of mockEmailHistory) {
    await ddb.send(new PutCommand({ 
      TableName: 'email-history', 
      Item: {
        ...history,
        ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
      }
    }));
  }

  // Seed Email Analytics Table
  console.log('📈 Seeding email analytics...');
  for (const analytics of mockEmailAnalytics) {
    await ddb.send(new PutCommand({ 
      TableName: 'email-analytics', 
      Item: analytics 
    }));
  }

  // Seed audience data
  console.log('👥 Seeding audience data...');
  for (const audience of mockAudience) {
    await ddb.send(new PutCommand({ 
      TableName: 'audience', 
      Item: audience 
    }));
  }

  console.log('✅ Database seeding complete!');
  console.log(`📊 Seeded ${mockEmailTemplates.length} email templates`);
  console.log(`📧 Seeded ${mockEmailHistory.length} email history records`);
  console.log(`📈 Seeded ${mockEmailAnalytics.length} analytics records`);
  console.log(`👥 Seeded ${mockAudience.length} audience members`);
  console.log(`📁 Uploaded ${mockS3Templates.length} S3 templates`);
  console.log(`🎨 Uploaded ${mockBrandedTemplates.length} branded templates`);
}

main().catch((e) => {
  console.error('❌ Seed failed', e);
  process.exit(1);
});


