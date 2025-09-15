import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class GoodBricksEmailDatabaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Email Templates Table
    const emailTemplatesTable = new dynamodb.Table(this, 'EmailTemplatesTable', {
      tableName: 'email-templates',
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'version',
        type: dynamodb.AttributeType.NUMBER
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true
    });

    // Add tags to the table
    cdk.Tags.of(emailTemplatesTable).add('Project', 'GoodBricks-Email-API');
    cdk.Tags.of(emailTemplatesTable).add('Environment', 'Production');
    cdk.Tags.of(emailTemplatesTable).add('Table', 'EmailTemplates');

    // Add GSI for category queries
    emailTemplatesTable.addGlobalSecondaryIndex({
      indexName: 'category-index',
      partitionKey: {
        name: 'category',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Add GSI for active templates
    emailTemplatesTable.addGlobalSecondaryIndex({
      indexName: 'active-index',
      partitionKey: {
        name: 'isActive',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Email History Table
    const emailHistoryTable = new dynamodb.Table(this, 'EmailHistoryTable', {
      tableName: 'email-history',
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl'
    });

    // Add tags to the table
    cdk.Tags.of(emailHistoryTable).add('Project', 'GoodBricks-Email-API');
    cdk.Tags.of(emailHistoryTable).add('Environment', 'Production');
    cdk.Tags.of(emailHistoryTable).add('Table', 'EmailHistory');

    // Add GSI for recipient queries
    emailHistoryTable.addGlobalSecondaryIndex({
      indexName: 'recipient-index',
      partitionKey: {
        name: 'recipientEmail',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Add GSI for template queries
    emailHistoryTable.addGlobalSecondaryIndex({
      indexName: 'template-index',
      partitionKey: {
        name: 'templateId',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Add GSI for status queries
    emailHistoryTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Add GSI for campaign queries
    emailHistoryTable.addGlobalSecondaryIndex({
      indexName: 'campaign-index',
      partitionKey: {
        name: 'campaignId',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Audience Table
    const audienceTable = new dynamodb.Table(this, 'AudienceTable', {
      tableName: 'audience',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'email',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true
    });

    // Add tags to the audience table
    cdk.Tags.of(audienceTable).add('Project', 'GoodBricks-Email-API');
    cdk.Tags.of(audienceTable).add('Environment', 'Production');
    cdk.Tags.of(audienceTable).add('Table', 'Audience');

    // Add GSI for email queries
    audienceTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: {
        name: 'email',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'lastModified',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Add GSI for tag queries
    audienceTable.addGlobalSecondaryIndex({
      indexName: 'tag-index',
      partitionKey: {
        name: 'tag',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'lastModified',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Add GSI for status queries
    audienceTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'lastModified',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Output table names for easy reference
    new cdk.CfnOutput(this, 'EmailTemplatesTableName', {
      value: emailTemplatesTable.tableName,
      description: 'Name of the Email Templates DynamoDB table'
    });

    new cdk.CfnOutput(this, 'EmailHistoryTableName', {
      value: emailHistoryTable.tableName,
      description: 'Name of the Email History DynamoDB table'
    });

    new cdk.CfnOutput(this, 'AudienceTableName', {
      value: audienceTable.tableName,
      description: 'Name of the Audience DynamoDB table'
    });

    new cdk.CfnOutput(this, 'EmailTemplatesTableArn', {
      value: emailTemplatesTable.tableArn,
      description: 'ARN of the Email Templates DynamoDB table'
    });

    new cdk.CfnOutput(this, 'EmailHistoryTableArn', {
      value: emailHistoryTable.tableArn,
      description: 'ARN of the Email History DynamoDB table'
    });

    new cdk.CfnOutput(this, 'AudienceTableArn', {
      value: audienceTable.tableArn,
      description: 'ARN of the Audience DynamoDB table'
    });

    // S3: Buckets for templates and branded templates
    const templatesBucket = new s3.Bucket(this, 'EmailTemplatesBucket', {
      bucketName: `gb-email-templates-${cdk.Aws.ACCOUNT_ID}-us-west-1`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false
    });

    const brandedTemplatesBucket = new s3.Bucket(this, 'BrandedEmailTemplatesBucket', {
      bucketName: `gb-branded-templates-${cdk.Aws.ACCOUNT_ID}-us-west-1`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false
    });

    cdk.Tags.of(templatesBucket).add('Project', 'GoodBricks-Email-API');
    cdk.Tags.of(brandedTemplatesBucket).add('Project', 'GoodBricks-Email-API');

    new cdk.CfnOutput(this, 'TemplatesBucketName', {
      value: templatesBucket.bucketName,
      description: 'S3 bucket for base email templates'
    });

    new cdk.CfnOutput(this, 'BrandedTemplatesBucketName', {
      value: brandedTemplatesBucket.bucketName,
      description: 'S3 bucket for branded email templates'
    });

    // Analytics DynamoDB table
    const analyticsTable = new dynamodb.Table(this, 'EmailAnalyticsTable', {
      tableName: 'email-analytics',
      partitionKey: { name: 'templateId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    analyticsTable.addGlobalSecondaryIndex({
      indexName: 'campaign-index',
      partitionKey: { name: 'campaignId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING }
    });

    new cdk.CfnOutput(this, 'EmailAnalyticsTableName', {
      value: analyticsTable.tableName,
      description: 'Name of the Email Analytics table'
    });
  }
}
