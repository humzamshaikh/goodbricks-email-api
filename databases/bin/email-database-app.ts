#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { GoodBricksEmailSingleTableStack } from '../lib/single-table-stack';

const app = new cdk.App();

// Single table stack - optimized architecture
new GoodBricksEmailSingleTableStack(app, 'GoodBricksEmailSingleTableStack', {
  env: {
    account: '900546257868',
    region: 'us-west-1'
  },
  description: 'Single table DynamoDB architecture for GoodBricks Email API'
});