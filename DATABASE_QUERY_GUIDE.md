# GoodBricks Email API - Database Query Guide

This document provides a comprehensive guide for querying the goodbricks-email-main DynamoDB table using all available PK/SK combinations and their corresponding Lambda functions.

## Table Structure Overview

**Table Name**: `goodbricks-email-main`  
**Design Pattern**: Single-table design with composite primary keys (PK/SK)

---

## 1. Organization Data

### 1.1 Get Organization Metadata
- **PK**: `USER#{cognito-id}`
- **SK**: `ORGMETADATA#` (begins with)
- **Lambda**: `get-getorgmetadataapi`
- **Purpose**: Retrieve organization details for a user
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `ORGMETADATA#`
- **Request Format**: `{"cognitoId": "cognito-user-cair"}`

### 1.2 Create Organization
- **PK**: `USER#{userId}`
- **SK**: `ORGMETADATA`
- **Lambda**: `post-createorgapi`
- **Purpose**: Create new organization
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `ORGMETADATA`

---

## 2. Audience Member Data

### 2.1 Get All Audience Members for User
- **PK**: `USER#{cognito-id}`
- **SK**: `AUDIENCE#` (begins with)
- **Lambda**: `get-getaudienceapi`
- **Purpose**: Retrieve all audience members for an organization
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `AUDIENCE#eshaikh.omar@gmail.com`
- **Request Format**: `{"cognitoId": "cognito-user-cair"}`

### 2.2 Get Specific Audience Member
- **PK**: `USER#{cognito-id}`
- **SK**: `AUDIENCE#{email}`
- **Lambda**: `get-getaudienceapi` (with specific email filter)
- **Purpose**: Get details for a specific audience member
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `AUDIENCE#eshaikh.omar@gmail.com`

### 2.3 Get Groups for Specific Audience Member
- **PK**: `USER#{cognito-id}#AUDIENCE#{email}`
- **SK**: `GROUP#` (begins with)
- **Lambda**: `get-getmembergroupsapi`
- **Purpose**: Find all groups an audience member belongs to
- **Example PK**: `USER#cognito-user-cair#AUDIENCE#omaralt148@gmail.com`
- **Example SK**: `GROUP#volunteers`
- **Request Format**: `{"cognitoId": "cognito-user-cair", "email": "omaralt148@gmail.com"}`

### 2.4 Get Campaigns for Specific Audience Member
- **PK**: `AUDIENCE_CAMPAIGNS#{cognito-id}#{email}`
- **SK**: `CAMPAIGN#` (begins with)
- **Lambda**: `get-getaudiencecampaignsapi`
- **Purpose**: Get all campaigns sent to a specific audience member
- **Example PK**: `AUDIENCE_CAMPAIGNS#cognito-user-cair#omaralt148@gmail.com`
- **Example SK**: `CAMPAIGN#cmp-12345678`

### 2.5 Get Detailed Campaigns for Specific Audience Member
- **PK**: `AUDIENCE_CAMPAIGNS#{cognito-id}#{email}`
- **SK**: `CAMPAIGN#` (begins with)
- **Lambda**: `get-getaudiencecampaigndetailsapi`
- **Purpose**: Get detailed campaign information for a specific audience member
- **Example PK**: `AUDIENCE_CAMPAIGNS#cognito-user-cair#omaralt148@gmail.com`
- **Example SK**: `CAMPAIGN#cmp-12345678`

### 2.6 Create Audience Member
- **PK**: `USER#{cognito-id}`
- **SK**: `AUDIENCE#{email}`
- **Lambda**: `post-createaudiencememberapi`
- **Purpose**: Create new audience member
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `AUDIENCE#omaralt148@gmail.com`

### 2.7 Import Audience Members (Bulk)
- **PK**: `USER#{cognito-id}`
- **SK**: `AUDIENCE#{email}` (for each member)
- **Lambda**: `post-importaudienceapi`
- **Purpose**: Bulk import audience members
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `AUDIENCE#member1@gmail.com`, `AUDIENCE#member2@gmail.com`, etc.

### 2.8 Update Audience Member
- **PK**: `USER#{cognito-id}`
- **SK**: `AUDIENCE#{email}`
- **Lambda**: `put-updateaudienceapi`
- **Purpose**: Update existing audience member
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `AUDIENCE#omaralt148@gmail.com`

### 2.9 Delete Audience Member
- **PK**: `USER#{cognito-id}`
- **SK**: `AUDIENCE#{email}`
- **Lambda**: `delete-deleteaudiencememberapi`
- **Purpose**: Delete audience member
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `AUDIENCE#omaralt148@gmail.com`

---

## 3. Group Data

### 3.1 Get All Group Metadata for User
- **PK**: `USER#{cognito-id}`
- **SK**: `GROUPMETADATA#` (begins with)
- **Lambda**: `get-getgroupmetadataapi`
- **Purpose**: Retrieve all group metadata for an organization
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `GROUPMETADATA#volunteers`
- **Request Format**: `{"cognitoId": "cognito-user-cair"}`

### 3.2 Get Specific Group Metadata
- **PK**: `USER#{cognito-id}`
- **SK**: `GROUPMETADATA#{groupId}`
- **Lambda**: `get-getgroupmetadataapi` (with specific group filter)
- **Purpose**: Get details for a specific group
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `GROUPMETADATA#volunteers`

### 3.3 Get All Audience Members in a Group
- **PK**: `USER#{cognito-id}#GROUP#{group-id}`
- **SK**: `AUDIENCE#` (begins with)
- **Lambda**: `get-getgroupaudienceapi`
- **Purpose**: Retrieve all audience members belonging to a specific group
- **Example PK**: `USER#cognito-user-cair#GROUP#volunteers`
- **Example SK**: `AUDIENCE#omaralt148@gmail.com`
- **Request Format**: `{"cognitoId": "cognito-user-cair", "groupId": "volunteers", "limit": 50}`

### 3.4 Get All Campaigns for a Group
- **PK**: `USER#{cognito-id}#GROUP#{group-id}`
- **SK**: `CAMPAIGN#` (begins with)
- **Lambda**: `get-getgroupcampaignsapi`
- **Purpose**: Retrieve all campaigns sent to a specific group
- **Example PK**: `USER#cognito-user-cair#GROUP#volunteers`
- **Example SK**: `CAMPAIGN#cmp-12345678`
- **Request Format**: `{"cognitoId": "cognito-user-cair", "groupId": "volunteers", "limit": 20, "status": "sent"}`

### 3.5 Get Campaigns by Status for Specific Group
- **PK**: `USER#{cognito-id}#GROUP#{group-id}`
- **SK**: `STATUS#{status}#CAMPAIGN#` (begins with)
- **Lambda**: `get-getgroupcampaignsbystatusapi`
- **Purpose**: Get campaigns filtered by status for a specific group (draft, sent, scheduled, sending, failed)
- **Example PK**: `USER#cognito-user-cair#GROUP#volunteers`
- **Example SK**: `STATUS#sent#CAMPAIGN#cmp-12345678`
- **Request Format**: `{"cognitoId": "cognito-user-cair", "groupId": "volunteers", "status": "sent"}`

### 3.6 Create Group Metadata
- **PK**: `USER#{cognito-id}`
- **SK**: `GROUPMETADATA#{groupId}`
- **Lambda**: `post-creategroupmetadataapi`
- **Purpose**: Create new group
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `GROUPMETADATA#volunteers`

### 3.7 Add Audience Member to Group
- **PK**: `USER#{cognito-id}#GROUP#{groupId}`
- **SK**: `AUDIENCE#{email}`
- **Lambda**: `post-addaudiencetogroupapi`
- **Purpose**: Add audience member to group
- **Example PK**: `USER#cognito-user-cair#GROUP#volunteers`
- **Example SK**: `AUDIENCE#omaralt148@gmail.com`

---

## 4. Campaign Data

### 4.1 Get Campaign Details
- **PK**: `USER#{cognito-id}`
- **SK**: `CAMPAIGN#{campaignId}`
- **Lambda**: `get-getcampaigndetailsapi`
- **Purpose**: Get detailed information for a specific campaign
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `CAMPAIGN#cmp-12345678`

### 4.2 Get All Campaigns for Organization
- **PK**: `USER#{cognito-id}`
- **SK**: `CAMPAIGN#` (begins with)
- **Lambda**: `get-getorgcampaignsapi`
- **Purpose**: Retrieve all campaigns for an organization
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `CAMPAIGN#cmp-12345678`
- **Request Format**: `{"cognitoId": "cognito-user-cair"}`

### 4.3 Get Campaigns by Status for Organization
- **PK**: `USER#{cognito-id}`
- **SK**: `STATUS#{status}#CAMPAIGN#` (begins with)
- **Lambda**: `get-getorgcampaignsbystatusapi`
- **Purpose**: Get campaigns filtered by status (draft, sent, scheduled, sending, failed)
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `STATUS#sent#CAMPAIGN#cmp-12345678`
- **Request Format**: `{"cognitoId": "cognito-user-cair", "status": "sent"}`

### 4.4 Create Campaign
- **PK**: `USER#{cognito-id}`
- **SK**: `CAMPAIGN#{campaignId}`
- **Lambda**: `post-createcampaignapi`
- **Purpose**: Create new campaign
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `CAMPAIGN#cmp-12345678`

### 4.5 Update Campaign
- **PK**: `USER#{cognito-id}`
- **SK**: `CAMPAIGN#{campaignId}`
- **Lambda**: `put-updatecampaignapi`
- **Purpose**: Update existing campaign
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `CAMPAIGN#cmp-12345678`

### 4.6 Send Campaign (Individual Emails)
- **PK**: `USER#{cognito-id}`
- **SK**: `CAMPAIGN#{campaignId}`
- **Lambda**: `post-sendcampaignv2api`
- **Purpose**: Send campaign to recipients using optimized individual email approach
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `CAMPAIGN#cmp-12345678`

### 4.7 Send Individual Email
- **PK**: `USER#{cognito-id}`
- **SK**: `EMAIL#{emailId}`
- **Lambda**: `post-sendemailapi`
- **Purpose**: Send individual email
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `EMAIL#email-12345678`

---

## 5. Layout/Template Data

### 5.1 Get All Email Templates/Layouts
- **PK**: `USER#{cognito-id}`
- **SK**: `LAYOUT#` (begins with)
- **Lambda**: `get-getemailtemplatesapi`
- **Purpose**: Retrieve all email templates/layouts for an organization
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `LAYOUT#event-gala-announcement`
- **Request Format**: `{"cognitoId": "cognito-user-cair"}`

### 5.2 Create Layout
- **PK**: `USER#{cognito-id}`
- **SK**: `LAYOUT#{templateId}`
- **Lambda**: `post-createlayoutapi`
- **Purpose**: Create new email layout/template
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `LAYOUT#event-gala-announcement`

### 5.3 Update Layout
- **PK**: `USER#{cognito-id}`
- **SK**: `LAYOUT#{templateId}`
- **Lambda**: `put-updatelayoutapi`
- **Purpose**: Update existing email layout/template
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `LAYOUT#event-gala-announcement`

### 5.4 Render Email
- **PK**: `USER#{cognito-id}`
- **SK**: `LAYOUT#{templateId}`
- **Lambda**: `post-renderemailapi`
- **Purpose**: Render email template with data
- **Example PK**: `USER#cognito-user-cair`
- **Example SK**: `LAYOUT#event-gala-announcement`

---

## 6. S3 Storage Patterns

### 6.1 Layout JSX Storage
- **S3 Path**: `s3://gb-email-layouts-900546257868-us-west-1/universal/{templateId}/latest/component.jsx`
- **Purpose**: Store JSX email templates
- **Example**: `s3://gb-email-layouts-900546257868-us-west-1/universal/event-gala-announcement/latest/component.jsx`

### 6.2 Layout Versioning
- **Latest Version**: `universal/{templateId}/latest/component.jsx`
- **Versioned**: `universal/{templateId}/v{version}/component.jsx`
- **Purpose**: Version control for email templates
- **Example**: `universal/event-gala-announcement/v1.0.0/component.jsx`

---

## 7. SES Integration

### 7.1 SES Template Creation
- **Template Name**: Uses campaign ID as template name
- **Purpose**: Dynamic template creation during campaign creation
- **Variables**: Automatically detected from JSX and used as DefaultTemplateData

### 7.2 Email Sending
- **Individual Emails**: Uses `SendEmailCommand` for personalized emails
- **Bulk Optimization**: Parallel batch processing with dynamic batch sizing
- **Rate Limiting**: Built-in throttling for large recipient lists

---

## Query Pattern Summary

### By User/Organization:
- `USER#{cognito-id}` + `AUDIENCE#` → All audience members
- `USER#{cognito-id}` + `GROUPMETADATA#` → All groups
- `USER#{cognito-id}` + `CAMPAIGN#` → All campaigns
- `USER#{cognito-id}` + `LAYOUT#` → All layouts
- `USER#{cognito-id}` + `ORGMETADATA#` → Organization metadata

### By Group:
- `USER#{cognito-id}#GROUP#{group-id}` + `AUDIENCE#` → Group members
- `USER#{cognito-id}#GROUP#{group-id}` + `CAMPAIGN#` → Group campaigns
- `USER#{cognito-id}#GROUP#{group-id}` + `STATUS#{status}#CAMPAIGN#` → Group campaigns by status

### By Audience Member:
- `USER#{cognito-id}#AUDIENCE#{email}` + `GROUP#` → Member's groups
- `AUDIENCE_CAMPAIGNS#{cognito-id}#{email}` + `CAMPAIGN#` → Member's campaigns

### By Status:
- `USER#{cognito-id}` + `STATUS#{status}#CAMPAIGN#` → Organization campaigns by status
- `USER#{cognito-id}#GROUP#{group-id}` + `STATUS#{status}#CAMPAIGN#` → Group campaigns by status

---

## Example Working Queries

### Get all audience members for CAIR:
```
PK = USER#cognito-user-cair
SK begins with AUDIENCE#
Lambda: get-getaudienceapi
Request: {"cognitoId": "cognito-user-cair"}
```

### Get all groups for a specific member:
```
PK = USER#cognito-user-cair#AUDIENCE#omaralt148@gmail.com
SK begins with GROUP#
Lambda: get-getmembergroupsapi
Request: {"cognitoId": "cognito-user-cair", "email": "omaralt148@gmail.com"}
```

### Get all campaigns for CAIR organization:
```
PK = USER#cognito-user-cair
SK begins with CAMPAIGN#
Lambda: get-getorgcampaignsapi
Request: {"cognitoId": "cognito-user-cair"}
```

### Get sent campaigns for CAIR:
```
PK = USER#cognito-user-cair
SK begins with STATUS#sent#CAMPAIGN#
Lambda: get-getorgcampaignsbystatusapi
Request: {"cognitoId": "cognito-user-cair", "status": "sent"}
```

### Get all group metadata for CAIR:
```
PK = USER#cognito-user-cair
SK begins with GROUPMETADATA#
Lambda: get-getgroupmetadataapi
Request: {"cognitoId": "cognito-user-cair"}
```

### Get volunteers group members:
```
PK = USER#cognito-user-cair#GROUP#volunteers
SK begins with AUDIENCE#
Lambda: get-getgroupaudienceapi
Request: {"cognitoId": "cognito-user-cair", "groupId": "volunteers", "limit": 50}
```

### Get campaigns sent to volunteers group:
```
PK = USER#cognito-user-cair#GROUP#volunteers
SK begins with CAMPAIGN#
Lambda: get-getgroupcampaignsapi
Request: {"cognitoId": "cognito-user-cair", "groupId": "volunteers", "limit": 20}
```

### Get sent campaigns for volunteers group:
```
PK = USER#cognito-user-cair#GROUP#volunteers
SK begins with STATUS#sent#CAMPAIGN#
Lambda: get-getgroupcampaignsbystatusapi
Request: {"cognitoId": "cognito-user-cair", "groupId": "volunteers", "status": "sent"}
```

### Get all layouts for CAIR:
```
PK = USER#cognito-user-cair
SK begins with LAYOUT#
Lambda: get-getemailtemplatesapi
Request: {"cognitoId": "cognito-user-cair"}
```

### Get all campaigns received by specific member:
```
PK = AUDIENCE_CAMPAIGNS#cognito-user-cair#omaralt148@gmail.com
SK begins with CAMPAIGN#
Lambda: get-getaudiencecampaignsapi
```

---

## Usage Notes

1. **Single Table Design**: All data is stored in one DynamoDB table with composite keys
2. **Consistent Naming**: PK/SK patterns follow consistent naming conventions
3. **Request Formats**: Most APIs now use JSON request bodies instead of path/query parameters
4. **Cognito Integration**: All user-specific queries use cognito-id for authentication
5. **Entity Types**: Most items include an `entityType` field for easier identification
6. **S3 Integration**: Layout JSX files are stored in S3, DynamoDB stores metadata and S3 paths
7. **Versioning**: Layouts support versioning with "latest" folder for current version
8. **SES Templates**: Created dynamically during campaign creation using detected variables
9. **Bulk Operations**: Optimized for thousands of recipients with parallel processing
10. **Status Filtering**: Campaign queries support filtering by status (draft, sent, scheduled, etc.)

---

*Last Updated: Based on current API implementations as of latest development*