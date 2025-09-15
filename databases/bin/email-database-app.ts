#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { GoodBricksEmailDatabaseStack } from '../lib/email-database-stack';

const app = new cdk.App();
new GoodBricksEmailDatabaseStack(app, 'EmailTemplatesDatabaseStack', {
  env: {
    account: '900546257868',
    region: 'us-west-2'
  },
  description: 'DynamoDB tables for GoodBricks Email API - Email Templates and Email History'
});