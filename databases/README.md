# GoodBricks Email Database Infrastructure

This CDK project creates the DynamoDB tables and S3 buckets for the GoodBricks Email API.

## Database Tables Created

### 1. Email Templates Table (`email-templates`)
- **Primary Key**: `id` (String) + `version` (Number)
- **Purpose**: Stores email template metadata and content references
- **GSIs**:
  - `category-index`: Query templates by category
  - `active-index`: Query active/inactive templates

### 2. Email History Table (`email-history`)
- **Primary Key**: `id` (String) + `timestamp` (String)
- **Purpose**: Tracks email sending history and status
- **GSIs**:
  - `recipient-index`: Query by recipient email
  - `template-index`: Query by template ID
  - `status-index`: Query by email status
  - `campaign-index`: Query by campaign ID

### 3. Email Analytics Table (`email-analytics`)
- **Primary Key**: `templateId` (String) + `date` (String)
- **Purpose**: Stores daily email performance metrics
- **GSIs**:
  - `campaign-index`: Query analytics by campaign ID

## S3 Buckets Created

### 1. Email Templates Bucket (`gb-email-templates-{account}-{region}`)
- **Purpose**: Stores base email template HTML files
- **Features**: Versioned, encrypted, private access

### 2. Branded Templates Bucket (`gb-branded-templates-{account}-{region}`)
- **Purpose**: Stores branded email template HTML files
- **Features**: Versioned, encrypted, private access

## Prerequisites

1. AWS CLI configured with your credentials
2. CDK CLI installed: `npm install -g aws-cdk`
3. Node.js 18+ installed

## Deployment

### Quick Start
```bash
# Install dependencies
npm install

# Deploy everything (builds, deploys, and seeds)
npm run deploy

# Or use the deployment script
./deploy.sh
```

### Manual Deployment Steps
```bash
# Install dependencies
npm install

# Bootstrap CDK (only needed once per account/region)
npm run bootstrap

# Build and deploy
npm run deploy

# Seed with sample data
npm run seed
```

### Development Commands
```bash
# Build TypeScript
npm run build

# Deploy without building
npx cdk deploy --region us-west-2

# Seed database with mock data
npm run seed

# Run tests
npm test

# Clean build artifacts
npm run clean
```

## Useful Commands

```bash
# Synthesize CloudFormation template
npx cdk synth

# See differences between deployed stack and current state
npx cdk diff

# Destroy the stack (be careful!)
npx cdk destroy

# List all stacks
npx cdk list
```

## Environment Variables

The stack is configured to deploy to:
- **AWS Account**: 900546257868
- **Region**: us-west-2

## Table Configuration

- **Billing Mode**: Pay-per-request (no capacity planning needed)
- **Point-in-time Recovery**: Enabled
- **Removal Policy**: Retain (tables won't be deleted on stack deletion)
- **TTL**: Enabled on email history table for automatic cleanup

## Outputs

After deployment, the following outputs will be available:
- `EmailTemplatesTableName`: Name of the email templates table
- `EmailHistoryTableName`: Name of the email history table
- `EmailAnalyticsTableName`: Name of the email analytics table
- `EmailTemplatesTableArn`: ARN of the email templates table
- `EmailHistoryTableArn`: ARN of the email history table
- `TemplatesBucketName`: Name of the S3 bucket for base templates
- `BrandedTemplatesBucketName`: Name of the S3 bucket for branded templates

## Testing Locally

Once deployed, you can test your lambdas locally against the real AWS tables by:

1. Setting up AWS credentials in your local environment
2. Using the table names in your lambda code
3. Running your lambdas with `npm run local:ts`

The tables will be accessible from your local development environment as long as your AWS credentials have the necessary permissions.

## Mock Data and Seeding

The database comes with comprehensive mock data for testing and development:

### Mock Data Includes:
- **6 Email Templates**: Welcome, password reset, newsletter, order confirmation, promotional
- **5 Email History Records**: Various statuses (sent, opened, clicked)
- **5 Analytics Records**: Daily performance metrics
- **5 S3 Template Files**: HTML templates with proper structure
- **4 Branded Templates**: Brand-specific template variations

### Seeding the Database:
```bash
# Seed with all mock data
npm run seed

# Seed with development settings
npm run seed:dev
```

The seed script will:
1. Upload HTML templates to S3 buckets
2. Populate DynamoDB tables with sample data
3. Set up proper TTL values for history records
4. Provide detailed logging of the seeding process

## Using the Database Client

A simple database client is provided for easy integration with your lambda functions:

```typescript
import { docClient, TABLE_NAMES } from './database-client.js';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

// Get a template
const command = new GetCommand({
  TableName: TABLE_NAMES.EMAIL_TEMPLATES,
  Key: { id: 'template_001', version: 1 }
});

const result = await docClient.send(command);
```

See `example-usage.ts` for more detailed examples of common operations.

## Environment Variables

Set these environment variables in your lambda functions to use the correct table names:

```bash
EMAIL_TEMPLATES_TABLE_NAME=email-templates
EMAIL_HISTORY_TABLE_NAME=email-history
AWS_REGION=us-west-2
```