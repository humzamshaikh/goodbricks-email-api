# GoodBricks Email Database Infrastructure

This CDK project creates the single table DynamoDB architecture for the GoodBricks Email API.

## Single Table Design

### Main Table (`goodbricks-email-main`)
- **Partition Key**: `PK` (String)
- **Sort Key**: `SK` (String)
- **Purpose**: Stores all email-related data in a single optimized table
- **Architecture**: Single table design with no GSIs needed

### Entity Types and Access Patterns

| Entity Type | PK | SK | Access Pattern | Use Case |
|-------------|----|----|----------------|----------|
| TEMPLATE | TEMPLATE#{templateId} | VERSION#{version} | Get all templates, Get specific template version | Email template management |
| TEMPLATE_CATEGORY | TEMPLATE_CATEGORY#{category} | TEMPLATE#{templateId}#VERSION#{version} | Get templates by category | Template browsing by category |
| TEMPLATE_STATUS | TEMPLATE_STATUS#{status} | TEMPLATE#{templateId}#VERSION#{version} | Get active/inactive templates | Template filtering |
| CAMPAIGN | USER#{userId} | CAMPAIGN#{campaignId} | Get campaigns for user | Campaign management |
| CAMPAIGN_STATUS | CAMPAIGN_STATUS#{status} | USER#{userId}#CAMPAIGN#{campaignId} | Get campaigns by status | Campaign filtering |
| AUDIENCE | USER#{userId} | AUDIENCE#{email} | Get audience for user | Audience management |
| AUDIENCE_GROUP | USER#{userId} | GROUP#{groupId} | Get groups for user | Group management |
| AUDIENCE_BY_GROUP | USER#{userId}#GROUP#{groupId} | AUDIENCE#{email} | Get audience by group | Group-based campaigns |
| AUDIENCE_STATUS | AUDIENCE_STATUS#{status} | USER#{userId}#AUDIENCE#{email} | Get active/deleted audience | Audience filtering |
| EMAIL_HISTORY | EMAIL_HISTORY#{email} | TIMESTAMP#{timestamp}#ID#{messageId} | Get email history by recipient | Email tracking |
| CAMPAIGN_EMAILS | CAMPAIGN_EMAILS#{campaignId} | EMAIL#{email}#TIMESTAMP#{timestamp} | Get emails sent for campaign | Campaign analytics |
| TRANSACTION_EMAIL | TRANSACTION_EMAIL#{transactionId} | TIMESTAMP#{timestamp} | Get transaction email details | Transaction receipts |

## S3 Buckets

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

# Deploy single table infrastructure
npm run deploy
```

### Manual Deployment Steps
```bash
# Install dependencies
npm install

# Bootstrap CDK (only needed once per account/region)
npm run bootstrap

# Build and deploy
npm run deploy
```

### Development Commands
```bash
# Build TypeScript
npm run build

# Deploy without building
npx cdk deploy GoodBricksEmailSingleTableStack --region us-west-1

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
- **Region**: us-west-1

## Table Configuration

- **Billing Mode**: Pay-per-request (no capacity planning needed)
- **Point-in-time Recovery**: Enabled
- **Removal Policy**: Retain (table won't be deleted on stack deletion)
- **TTL**: Enabled for automatic cleanup of old email history

## Outputs

After deployment, the following outputs will be available:
- `MainTableName`: Name of the main DynamoDB table (`goodbricks-email-main`)
- `MainTableArn`: ARN of the main DynamoDB table
- `TemplatesBucketName`: S3 bucket for base email templates
- `BrandedTemplatesBucketName`: S3 bucket for branded email templates

## Lambda Environment Variables

Set this environment variable in your lambda functions:
```bash
MAIN_TABLE_NAME=goodbricks-email-main
```

## Benefits of Single Table Design

1. **Cost Reduction**: No GSI charges (saves ~60-80% on DynamoDB costs)
2. **Better Performance**: Single queries instead of multiple table joins
3. **Simplified Architecture**: One table to manage instead of multiple
4. **Scalable**: Better hot partition distribution
5. **Maintainable**: Cleaner access patterns and reduced complexity

## Query Examples

```typescript
// Get all active templates
const params = {
  TableName: 'goodbricks-email-main',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
  ExpressionAttributeValues: {
    ':pk': 'TEMPLATE_STATUS#ACTIVE',
    ':sk': 'TEMPLATE#'
  }
};

// Get user's campaigns
const params = {
  TableName: 'goodbricks-email-main',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
  ExpressionAttributeValues: {
    ':pk': 'USER#user123',
    ':sk': 'CAMPAIGN#'
  }
};

// Get audience by group
const params = {
  TableName: 'goodbricks-email-main',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
  ExpressionAttributeValues: {
    ':pk': 'USER#user123#GROUP#newsletter',
    ':sk': 'AUDIENCE#'
  }
};
```