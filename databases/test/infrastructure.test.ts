import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { GoodBricksEmailDatabaseStack } from '../lib/email-database-stack';

test('Email Templates Table Created', () => {
  const app = new cdk.App();
  const stack = new GoodBricksEmailDatabaseStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'email-templates',
    BillingMode: 'PAY_PER_REQUEST'
  });
});

test('Email History Table Created', () => {
  const app = new cdk.App();
  const stack = new GoodBricksEmailDatabaseStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'email-history',
    BillingMode: 'PAY_PER_REQUEST'
  });
});

test('Email Analytics Table Created', () => {
  const app = new cdk.App();
  const stack = new GoodBricksEmailDatabaseStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'email-analytics',
    BillingMode: 'PAY_PER_REQUEST'
  });
});

test('S3 Buckets Created', () => {
  const app = new cdk.App();
  const stack = new GoodBricksEmailDatabaseStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  // Check for S3 buckets
  template.resourceCountIs('AWS::S3::Bucket', 2);
});
