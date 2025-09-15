#!/bin/bash

# GoodBricks Email Database Deployment Script
# This script deploys the DynamoDB tables and S3 buckets for the GoodBricks Email API

set -e

echo "🚀 Starting GoodBricks Email Database Deployment..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    echo "❌ AWS CDK is not installed. Installing..."
    npm install -g aws-cdk
fi

# Check AWS credentials
echo "🔍 Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

# Get current AWS account
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "✅ Using AWS Account: $ACCOUNT"

# Check if this is the correct account
if [ "$ACCOUNT" != "900546257868" ]; then
    echo "⚠️  Warning: Expected account 900546257868, but using $ACCOUNT"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment cancelled."
        exit 1
    fi
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Bootstrap CDK if needed
echo "🔧 Checking CDK bootstrap..."
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region us-west-2 &> /dev/null; then
    echo "🚀 Bootstrapping CDK..."
    npx cdk bootstrap --region us-west-2
else
    echo "✅ CDK already bootstrapped"
fi

# Deploy the stack
echo "🚀 Deploying GoodBricks Email Database Stack..."
npx cdk deploy --region us-west-2 --require-approval never

echo "✅ Deployment completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Note the table names and S3 bucket names from the outputs above"
echo "2. Update your lambda code to use these table names"
echo "3. Seed the database with sample data: npm run seed"
echo "4. Test your lambdas locally against the real AWS tables"
echo ""
echo "🔍 To view the deployed resources:"
echo "aws dynamodb list-tables --region us-west-2"
echo "aws s3 ls --region us-west-2 | grep gb-"
