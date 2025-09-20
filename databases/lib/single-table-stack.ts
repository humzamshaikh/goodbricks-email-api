import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class GoodBricksEmailSingleTableStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Single Main Table - No GSIs needed!
    const mainTable = new dynamodb.Table(this, 'GoodBricksEmailMainTable', {
      tableName: 'goodbricks-email-main',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      timeToLiveAttribute: 'ttl'
    });

    // Add tags to the table
    cdk.Tags.of(mainTable).add('Project', 'GoodBricks-Email-API');
    cdk.Tags.of(mainTable).add('Environment', 'Production');
    cdk.Tags.of(mainTable).add('Table', 'MainTable');
    cdk.Tags.of(mainTable).add('Architecture', 'SingleTable');

    // S3: Reference existing buckets (don't create new ones)
    const templatesBucket = s3.Bucket.fromBucketName(this, 'EmailTemplatesBucket', 
      `gb-email-templates-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`
    );

    const brandedTemplatesBucket = s3.Bucket.fromBucketName(this, 'BrandedEmailTemplatesBucket', 
      `gb-branded-templates-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`
    );

    // Outputs
    new cdk.CfnOutput(this, 'MainTableName', {
      value: mainTable.tableName,
      description: 'Name of the main DynamoDB table'
    });

    new cdk.CfnOutput(this, 'MainTableArn', {
      value: mainTable.tableArn,
      description: 'ARN of the main DynamoDB table'
    });

    new cdk.CfnOutput(this, 'TemplatesBucketName', {
      value: templatesBucket.bucketName,
      description: 'S3 bucket for base email templates'
    });

    new cdk.CfnOutput(this, 'BrandedTemplatesBucketName', {
      value: brandedTemplatesBucket.bucketName,
      description: 'S3 bucket for branded email templates'
    });
  }
}