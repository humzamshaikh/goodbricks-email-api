# Complete Workflow Guide: From Organization Creation to Campaign Sending

This guide walks you through the entire process of setting up an organization and sending personalized email campaigns using the GoodBricks Email API.

## Table of Contents
1. [Step 1: Create Organization Metadata](#step-1-create-organization-metadata)
2. [Step 2: Add Audience Members](#step-2-add-audience-members)
3. [Step 3: Create Audience Groups](#step-3-create-audience-groups)
4. [Step 4: Add Members to Groups](#step-4-add-members-to-groups)
5. [Step 5: Create Email Layout](#step-5-create-email-layout)
6. [Step 6: Create Campaign](#step-6-create-campaign)
7. [Step 7: Edit Campaign](#step-7-edit-campaign)
8. [Step 8: Send Campaign](#step-8-send-campaign)
9. [Database Operations Summary](#database-operations-summary)
10. [API Endpoints Reference](#api-endpoints-reference)

---

## Step 1: Create Organization Metadata

**API:** `POST /create-org-metadata`  
**Purpose:** Initialize your organization with basic information and sender email

### Request Body:
```json
{
  "cognitoId": "cognito-user-org123",
  "orgName": "My Nonprofit Organization",
  "description": "A nonprofit dedicated to community service",
  "website": "https://www.mynonprofit.org",
  "senderEmail": "noreply@mynonprofit.org",
  "address": "123 Community St, City, State 12345",
  "phone": "+1-555-0123"
}
```

### Database Operations:
- **Creates:** `USER#{cognitoId} + ORGMETADATA#{orgId}` record
- **Fields:** userId, orgName, activeSubscribers, description, website, senderEmail, address, phone, createdAt, lastModified

### Response:
```json
{
  "success": true,
  "orgId": "org-abc123",
  "message": "Organization metadata created successfully"
}
```

---

## Step 2: Add Audience Members

**API:** `POST /import-audience`  
**Purpose:** Add audience members to your organization

### Request Body:
```json
{
  "cognitoId": "cognito-user-org123",
  "audienceMembers": [
    {
      "email": "john.doe@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "tags": ["volunteer", "donor"],
      "status": "active"
    },
    {
      "email": "jane.smith@example.com",
      "firstName": "Jane",
      "lastName": "Smith",
      "tags": ["volunteer"],
      "status": "active"
    }
  ]
}
```

### Database Operations:
- **Creates:** `USER#{cognitoId} + AUDIENCE#{email}` records for each member
- **Fields:** email, firstName, lastName, tags, status, createdAt, lastModified

### Response:
```json
{
  "success": true,
  "importedCount": 2,
  "skippedCount": 0,
  "message": "Successfully imported 2 audience members"
}
```

---

## Step 3: Create Audience Groups

**API:** `POST /create-group-metadata`  
**Purpose:** Create groups to organize your audience members

### Request Body:
```json
{
  "cognitoId": "cognito-user-org123",
  "groupName": "volunteers",
  "description": "Active volunteers who help with events",
  "tags": ["volunteer", "active"]
}
```

### Database Operations:
- **Creates:** `USER#{cognitoId} + GROUPMETADATA#{groupId}` record
- **Fields:** groupId, groupName, description, tags, memberCount, createdAt, lastModified

### Response:
```json
{
  "success": true,
  "groupId": "grp-volunteers-123",
  "message": "Group metadata created successfully"
}
```

**Repeat for additional groups:**
```json
{
  "cognitoId": "cognito-user-org123",
  "groupName": "donors",
  "description": "Regular donors and supporters",
  "tags": ["donor", "supporter"]
}
```

---

## Step 4: Add Members to Groups

**API:** `POST /add-audience-to-group`  
**Purpose:** Add audience members to specific groups

### Request Body:
```json
{
  "cognitoId": "cognito-user-org123",
  "groupId": "grp-volunteers-123",
  "emails": ["john.doe@example.com", "jane.smith@example.com"]
}
```

### Database Operations:
- **Creates:** `USER#{cognitoId}#GROUP#{groupId} + AUDIENCE#{email}` records
- **Updates:** Group member count in group metadata
- **Fields:** email, firstName, lastName, tags, status, groupId, joinedAt

### Response:
```json
{
  "success": true,
  "addedCount": 2,
  "skippedCount": 0,
  "message": "Successfully added 2 members to group volunteers"
}
```

---

## Step 5: Create Email Layout

**API:** `POST /create-layout`  
**Purpose:** Create a reusable email template with personalization variables

### Request Body:
```json
{
  "name": "impact-report",
  "description": "Annual impact report template",
  "category": "newsletters",
  "jsxCode": "import React from 'react';\n\nexport default function ImpactReport({ firstName = 'Friend' }) {\n  return (\n    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto' }}>\n      <h1>GoodBricks Impact Report</h1>\n      <h2>Dear {firstName},</h2>\n      <p>Thank you for your support this year!</p>\n      <div style={{ backgroundColor: '#f0f0f0', padding: '20px', textAlign: 'center' }}>\n        <h3>Our Impact</h3>\n        <p>2,847 lives changed</p>\n      </div>\n    </div>\n  );\n}"
}
```

### Database Operations:
- **Creates:** 4 DynamoDB records:
  - `LAYOUT#{layoutId} + METADATA` (primary layout record)
  - `LAYOUT#{layoutId} + VERSION#{version}` (version-specific record)
  - `LAYOUT#{layoutId} + CATEGORY#{category}` (category index)
  - `LAYOUT#{layoutId} + VERSION#latest` (latest version pointer)
- **Uploads:** JSX file to S3: `{layoutId}/{version}/{layoutId}.jsx`

### Response:
```json
{
  "success": true,
  "layoutId": "impact-report",
  "version": "v1.0.0",
  "s3Key": "impact-report/v1.0.0/impact-report.jsx",
  "detectedVariables": ["firstName"],
  "renderedHtml": "<!DOCTYPE html>...",
  "message": "Layout created successfully"
}
```

---

## Step 6: Create Campaign

**API:** `POST /create-campaign`  
**Purpose:** Create a new email campaign with layout and audience selection

### Request Body:
```json
{
  "cognitoId": "cognito-user-org123",
  "name": "2024 Annual Impact Report",
  "description": "Share our annual achievements with volunteers",
  "layoutId": "impact-report",
  "layoutVersion": "latest",
  "audienceSelection": {
    "type": "groups",
    "values": ["grp-volunteers-123"]
  },
  "status": "draft",
  "metadata": {
    "subject": "Our 2024 Impact Report - Thank You!",
    "fromName": "GoodBricks Team",
    "previewText": "See the incredible impact we made together"
  }
}
```

### Database Operations:
- **Creates:** 4 DynamoDB records:
  - `USER#{cognitoId} + CAMPAIGN#{campaignId}` (primary campaign record)
  - `USER#{cognitoId} + STATUS#draft#CAMPAIGN#{campaignId}` (status index)
  - `USER#{cognitoId}#GROUP#{groupId} + CAMPAIGN#{campaignId}` (group campaign index)
  - `USER#{cognitoId}#GROUP#{groupId} + STATUS#draft#CAMPAIGN#{campaignId}` (group status index)
- **Retrieves:** Layout JSX from S3 and renders to HTML
- **Creates:** SES template with name `{cognitoId}_{campaignId}`

### Response:
```json
{
  "success": true,
  "campaignId": "cmp-abc123",
  "campaign": { /* campaign details */ },
  "layout": { /* layout details */ },
  "renderedHtml": "<!DOCTYPE html>...",
  "sesTemplate": {
    "templateName": "cognito-user-org123_cmp-abc123",
    "created": true,
    "variables": ["firstName"]
  },
  "message": "Campaign created successfully"
}
```

---

## Step 7: Edit Campaign

**API:** `PUT /update-campaign`  
**Purpose:** Modify campaign details, layout, or audience selection

### Request Body:
```json
{
  "cognitoId": "cognito-user-org123",
  "campaignId": "cmp-abc123",
  "name": "2024 Annual Impact Report - Updated",
  "metadata": {
    "subject": "Updated: Our 2024 Impact Report",
    "previewText": "Updated preview text"
  },
  "layoutId": "impact-report",
  "layoutVersion": "latest"
}
```

### Database Operations:
- **Updates:** `USER#{cognitoId} + CAMPAIGN#{campaignId}` record
- **Retrieves:** Updated layout from S3 if layoutId changed
- **Updates:** SES template if layout or variables changed
- **Updates:** Status index records if status changed

### Response:
```json
{
  "success": true,
  "campaign": { /* updated campaign details */ },
  "layoutRetrieved": true,
  "sesTemplate": {
    "templateName": "cognito-user-org123_cmp-abc123",
    "updated": true,
    "variables": ["firstName"]
  },
  "message": "Campaign updated successfully"
}
```

---

## Step 8: Send Campaign

**API:** `POST /send-campaign`  
**Purpose:** Send the campaign to selected audience members

### Request Body:
```json
{
  "cognitoId": "cognito-user-org123",
  "campaignId": "cmp-abc123"
}
```

### Database Operations:
1. **Retrieves:** Campaign details and layout from DynamoDB
2. **Queries:** Audience members based on campaign's audienceSelection:
   - If `type: "groups"`: Queries `USER#{cognitoId}#GROUP#{groupId} + AUDIENCE#{email}`
   - If `type: "all_audience"`: Queries `USER#{cognitoId} + AUDIENCE#{email}`
3. **Creates:** Audience campaign tracking records:
   - `USER#{cognitoId}#AUDIENCE#{email} + CAMPAIGN#{campaignId}` for each recipient
4. **Updates:** Campaign status from "draft" to "sent":
   - Updates `USER#{cognitoId} + CAMPAIGN#{campaignId}`
   - Deletes old status index: `USER#{cognitoId} + STATUS#draft#CAMPAIGN#{campaignId}`
   - Creates new status index: `USER#{cognitoId} + STATUS#sent#CAMPAIGN#{campaignId}`
5. **Sends:** Bulk email via SES using template `{cognitoId}_{campaignId}`

### Response:
```json
{
  "success": true,
  "campaignId": "cmp-abc123",
  "campaignName": "2024 Annual Impact Report - Updated",
  "templateName": "cognito-user-org123_cmp-abc123",
  "recipients": {
    "total": 2,
    "groups": ["volunteers"],
    "emails": ["john.doe@example.com", "jane.smith@example.com"]
  },
  "sesResponse": {
    "messageId": "bulk-template-send",
    "status": "success",
    "sent": 2,
    "failed": 0
  },
  "campaignStatus": {
    "updated": true,
    "newStatus": "sent"
  },
  "trackingRecords": {
    "created": 2
  },
  "message": "Campaign sent successfully"
}
```

---

## Database Operations Summary

### DynamoDB Table Structure:
```
Table: goodbricks-email-main
PK (Partition Key) | SK (Sort Key) | Record Type
-------------------|---------------|------------
USER#{cognitoId} | ORGMETADATA#{orgId} | Organization metadata
USER#{cognitoId} | AUDIENCE#{email} | Audience member
USER#{cognitoId} | GROUPMETADATA#{groupId} | Group metadata
USER#{cognitoId}#GROUP#{groupId} | AUDIENCE#{email} | Member in group
USER#{cognitoId} | CAMPAIGN#{campaignId} | Campaign details
USER#{cognitoId} | STATUS#{status}#CAMPAIGN#{campaignId} | Campaign status index
USER#{cognitoId}#GROUP#{groupId} | CAMPAIGN#{campaignId} | Group campaign index
USER#{cognitoId}#AUDIENCE#{email} | CAMPAIGN#{campaignId} | Campaign tracking
LAYOUT#{layoutId} | METADATA | Layout metadata
LAYOUT#{layoutId} | VERSION#{version} | Layout version
LAYOUT#{layoutId} | CATEGORY#{category} | Layout category index
```

### S3 Structure:
```
Bucket: gb-email-layouts-{account-id}-{region}
├── {layoutId}/
│   ├── {version}/
│   │   └── {layoutId}.jsx
│   └── latest/
│       └── {layoutId}.jsx
```

### SES Templates:
- **Template Name Format:** `{cognitoId}_{campaignId}`
- **Variables:** Extracted from JSX component parameters
- **Content:** Rendered HTML from JSX layout

---

## API Endpoints Reference

### Organization Management:
- `POST /create-org-metadata` - Create organization
- `GET /get-org-metadata` - Get organization details

### Audience Management:
- `POST /import-audience` - Add audience members
- `GET /get-audience` - Get all audience members
- `PUT /update-audience` - Update audience member
- `POST /create-group-metadata` - Create audience group
- `POST /add-audience-to-group` - Add members to group
- `GET /get-group-audience` - Get group members

### Layout Management:
- `POST /create-layout` - Create email layout
- `GET /get-email-templates` - Get all layouts
- `PUT /update-layout` - Update layout

### Campaign Management:
- `POST /create-campaign` - Create campaign
- `GET /get-org-campaigns` - Get organization campaigns
- `PUT /update-campaign` - Update campaign
- `POST /send-campaign` - Send campaign

### Analytics:
- `GET /get-campaign-details` - Get campaign details
- `GET /get-audience-campaigns` - Get recipient campaign history

---

## Complete Example Workflow

Here's a complete example showing all API calls in sequence:

### 1. Create Organization
```bash
curl -X POST https://api.goodbricks.org/create-org-metadata \
  -H "Content-Type: application/json" \
  -d '{
    "cognitoId": "cognito-user-org123",
    "orgName": "Community Food Bank",
    "description": "Helping families in need",
    "senderEmail": "noreply@communityfoodbank.org"
  }'
```

### 2. Add Audience Members
```bash
curl -X POST https://api.goodbricks.org/import-audience \
  -H "Content-Type: application/json" \
  -d '{
    "cognitoId": "cognito-user-org123",
    "audienceMembers": [
      {"email": "volunteer1@example.com", "firstName": "Alice", "lastName": "Johnson"},
      {"email": "volunteer2@example.com", "firstName": "Bob", "lastName": "Smith"}
    ]
  }'
```

### 3. Create Group
```bash
curl -X POST https://api.goodbricks.org/create-group-metadata \
  -H "Content-Type: application/json" \
  -d '{
    "cognitoId": "cognito-user-org123",
    "groupName": "volunteers",
    "description": "Active volunteers"
  }'
```

### 4. Add Members to Group
```bash
curl -X POST https://api.goodbricks.org/add-audience-to-group \
  -H "Content-Type: application/json" \
  -d '{
    "cognitoId": "cognito-user-org123",
    "groupId": "grp-volunteers-123",
    "emails": ["volunteer1@example.com", "volunteer2@example.com"]
  }'
```

### 5. Create Layout
```bash
curl -X POST https://api.goodbricks.org/create-layout \
  -H "Content-Type: application/json" \
  -d '{
    "name": "thank-you",
    "description": "Thank you email template",
    "category": "newsletters",
    "jsxCode": "import React from \"react\";\nexport default function ThankYou({ firstName = \"Friend\" }) {\n  return (\n    <div>\n      <h1>Thank you, {firstName}!</h1>\n      <p>Your support means everything to us.</p>\n    </div>\n  );\n}"
  }'
```

### 6. Create Campaign
```bash
curl -X POST https://api.goodbricks.org/create-campaign \
  -H "Content-Type: application/json" \
  -d '{
    "cognitoId": "cognito-user-org123",
    "name": "Thank You Campaign",
    "layoutId": "thank-you",
    "layoutVersion": "latest",
    "audienceSelection": {"type": "groups", "values": ["grp-volunteers-123"]},
    "status": "draft",
    "metadata": {"subject": "Thank You for Volunteering!"}
  }'
```

### 7. Send Campaign
```bash
curl -X POST https://api.goodbricks.org/send-campaign \
  -H "Content-Type: application/json" \
  -d '{
    "cognitoId": "cognito-user-org123",
    "campaignId": "cmp-abc123"
  }'
```

---

This workflow ensures that:
- ✅ Organization is properly set up with sender email
- ✅ Audience members are imported and organized into groups
- ✅ Email templates are created with personalization variables
- ✅ Campaigns are configured with proper audience targeting
- ✅ Emails are sent with personalized content via SES
- ✅ All interactions are tracked in DynamoDB for analytics

The system handles personalization automatically by extracting variables from JSX templates and passing recipient data to SES for variable substitution.
