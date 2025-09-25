# GoodBricks Email API - Database Query Guide

This document provides a comprehensive guide for querying the goodbricks-email-main DynamoDB table using all available PK/SK combinations and their corresponding Lambda functions.

## Table Structure Overview

**Table Name**: `goodbricks-email-main`  
**Design Pattern**: Single-table design with composite primary keys (PK/SK)

---

## 1. Organization Data

### 1.1 Get Organization Metadata
- **PK**: `USER#{userId}`
- **SK**: `ORGMETADATA`
- **Lambda**: `get-getorgmetadataapi`
- **Purpose**: Retrieve organization details for a user
- **Example PK**: `USER#cognito-user-mcc`
- **Example SK**: `ORGMETADATA`

---

## 2. Audience Member Data

### 2.1 Get All Audience Members for User
- **PK**: `USER#{userId}`
- **SK**: `AUDIENCE#` (begins with)
- **Lambda**: `get-getaudienceapi`
- **Purpose**: Retrieve all audience members for an organization
- **Example PK**: `USER#cognito-user-mcc`
- **Example SK**: `AUDIENCE#eshaikh.omar@gmail.com`

### 2.2 Get Specific Audience Member
- **PK**: `USER#{userId}`
- **SK**: `AUDIENCE#{email}`
- **Lambda**: `get-getaudienceapi` (with specific email filter)
- **Purpose**: Get details for a specific audience member
- **Example PK**: `USER#cognito-user-mcc`
- **Example SK**: `AUDIENCE#eshaikh.omar@gmail.com`

### 2.3 Get Groups for Specific Audience Member
- **PK**: `USER#{userId}`
- **SK**: `AUDIENCE#{email}`
- **Lambda**: `get-getmembergroupsapi`
- **Purpose**: Find all groups an audience member belongs to (reads tags array)
- **Example PK**: `USER#cognito-user-mcc`
- **Example SK**: `AUDIENCE#eshaikh.omar@gmail.com`

---

## 3. Group Data

### 3.1 Get All Group Metadata for User
- **PK**: `USER#{userId}`
- **SK**: `GROUPMETADATA#` (begins with)
- **Lambda**: `get-getgroupmetadataapi`
- **Purpose**: Retrieve all group metadata for an organization
- **Example PK**: `USER#cognito-user-mcc`
- **Example SK**: `GROUPMETADATA#basic-members`

### 3.2 Get Specific Group Metadata
- **PK**: `USER#{userId}`
- **SK**: `GROUPMETADATA#{groupId}`
- **Lambda**: `get-getgroupmetadataapi` (with specific group filter)
- **Purpose**: Get details for a specific group
- **Example PK**: `USER#cognito-user-mcc`
- **Example SK**: `GROUPMETADATA#basic-members`

### 3.3 Get All Audience Members in a Group
- **PK**: `USER#{userId}#GROUP#{groupId}`
- **SK**: `AUDIENCE#` (begins with)
- **Lambda**: `get-getgroupaudienceapi`
- **Purpose**: Retrieve all audience members belonging to a specific group
- **Example PK**: `USER#cognito-user-mcc#GROUP#basic-members`
- **Example SK**: `AUDIENCE#eshaikh.omar@gmail.com`

---

## 4. Campaign Data

### 4.1 Get Campaign Details
- **PK**: `USER#{userId}`
- **SK**: `CAMPAIGN#{campaignId}`
- **Lambda**: `get-getcampaigndetailsapi`
- **Purpose**: Get detailed information for a specific campaign
- **Example PK**: `USER#cognito-user-mcc`
- **Example SK**: `CAMPAIGN#cmp-12345678`

### 4.2 Get All Campaigns for Organization
- **PK**: `ORG_CAMPAIGNS#{userId}`
- **SK**: `CAMPAIGN#` (begins with)
- **Lambda**: `get-getorgcampaignsapi`
- **Purpose**: Retrieve all campaigns for an organization
- **Example PK**: `ORG_CAMPAIGNS#cognito-user-mcc`
- **Example SK**: `CAMPAIGN#cmp-12345678`

### 4.3 Get Campaigns by Status for Organization
- **PK**: `ORG_STATUS_CAMPAIGNS#{userId}#{status}`
- **SK**: `CAMPAIGN#` (begins with)
- **Lambda**: `get-getorgcampaignsbystatusapi`
- **Purpose**: Get campaigns filtered by status (DRAFT, SENT, SCHEDULED)
- **Example PK**: `ORG_STATUS_CAMPAIGNS#cognito-user-mcc#SENT`
- **Example SK**: `CAMPAIGN#cmp-12345678`

### 4.4 Get Campaigns for Specific Group
- **PK**: `GROUP_CAMPAIGNS#{userId}#{groupId}`
- **SK**: `CAMPAIGN#` (begins with)
- **Lambda**: `get-getgroupcampaignsapi`
- **Purpose**: Retrieve all campaigns sent to a specific group
- **Example PK**: `GROUP_CAMPAIGNS#cognito-user-mcc#basic-members`
- **Example SK**: `CAMPAIGN#cmp-12345678`

---

## 5. Audience Campaign Tracking

### 5.1 Get All Campaigns Sent to Specific Audience Member
- **PK**: `AUDIENCE_CAMPAIGNS#{userId}#{email}`
- **SK**: `CAMPAIGN#` (begins with)
- **Lambda**: `get-getaudiencecampaignsapi`
- **Purpose**: Track all campaigns received by a specific audience member
- **Example PK**: `AUDIENCE_CAMPAIGNS#cognito-user-mcc#eshaikh.omar@gmail.com`
- **Example SK**: `CAMPAIGN#cmp-12345678`

### 5.2 Get Detailed Campaign Analytics for Audience Member
- **PK**: `AUDIENCE_CAMPAIGNS#{userId}#{email}`
- **SK**: `CAMPAIGN#` (begins with)
- **Lambda**: `get-getaudiencecampaigndetailsapi`
- **Purpose**: Get detailed campaign information and analytics for an audience member
- **Example PK**: `AUDIENCE_CAMPAIGNS#cognito-user-mcc#eshaikh.omar@gmail.com`
- **Example SK**: `CAMPAIGN#cmp-12345678`

### 5.3 Get Campaign Totals for All Organization Audience Members
- **PK**: `USER#{userId}`
- **SK**: `AUDIENCE#` (begins with)
- **Lambda**: `get-getaudiencecampaigntotalsapi`
- **Purpose**: Get campaign analytics summary for all audience members in an organization
- **Example PK**: `USER#cognito-user-mcc`
- **Example SK**: `AUDIENCE#eshaikh.omar@gmail.com`

---

## 6. Campaign Recipients Tracking

### 6.1 Get Campaign Send Records
- **PK**: `CAMPAIGN_RECIPIENTS#{campaignId}`
- **SK**: `SENT#{timestamp}`
- **Lambda**: Custom query (no specific lambda yet)
- **Purpose**: Track when campaigns were sent and to whom
- **Example PK**: `CAMPAIGN_RECIPIENTS#cmp-12345678`
- **Example SK**: `SENT#2025-01-27T10:30:00.000Z`

---

## 7. Legacy/Alternative Query Patterns

### 7.1 Get All Campaigns (Legacy)
- **PK**: `USER#{userId}`
- **SK**: `CAMPAIGN#` (begins with)
- **Lambda**: `get-getcampaignsapi`
- **Purpose**: Alternative way to get all campaigns for a user
- **Example PK**: `USER#cognito-user-mcc`
- **Example SK**: `CAMPAIGN#cmp-12345678`

---

## Query Pattern Summary

### Primary Data Access Patterns:
1. **Organization Level**: `USER#{userId}` + various SK patterns
2. **Group Level**: `USER#{userId}#GROUP#{groupId}` + `AUDIENCE#` SK
3. **Campaign Indexes**: `ORG_CAMPAIGNS#{userId}`, `ORG_STATUS_CAMPAIGNS#{userId}#{status}`, `GROUP_CAMPAIGNS#{userId}#{groupId}`
4. **Audience Tracking**: `AUDIENCE_CAMPAIGNS#{userId}#{email}` + `CAMPAIGN#` SK
5. **Campaign Recipients**: `CAMPAIGN_RECIPIENTS#{campaignId}` + `SENT#{timestamp}` SK

### Lambda Function Categories:
- **Data Retrieval**: get-* lambdas
- **Data Creation**: post-create* lambdas  
- **Data Updates**: put-update* lambdas
- **Data Import**: post-importaudienceapi
- **Actions**: post-send*, post-add* lambdas

---

## Usage Notes

1. **Begins With Queries**: When SK uses "begins with" pattern, use `begins_with(SK, 'PREFIX#')` in query conditions
2. **Pagination**: Most lambdas support pagination via `limit` and `nextToken` parameters
3. **Error Handling**: All lambdas return consistent error responses with appropriate HTTP status codes
4. **Data Consistency**: The system uses dual-write patterns for campaign data to enable multiple access patterns
5. **Entity Types**: Most items include an `entityType` field for easier identification

---

## Example Working Queries

### Get all MCC organization data:
```
PK = USER#cognito-user-mcc
SK begins with AUDIENCE#
Lambda: get-getaudienceapi
```

### Get campaigns sent to basic-members group:
```
PK = GROUP_CAMPAIGNS#cognito-user-mcc#basic-members  
SK begins with CAMPAIGN#
Lambda: get-getgroupcampaignsapi
```

### Get all campaigns received by specific member:
```
PK = AUDIENCE_CAMPAIGNS#cognito-user-mcc#eshaikh.omar@gmail.com
SK begins with CAMPAIGN#
Lambda: get-getaudiencecampaignsapi
```

### Get all sent campaigns for MCC:
```
PK = ORG_STATUS_CAMPAIGNS#cognito-user-mcc#SENT
SK begins with CAMPAIGN#
Lambda: get-getorgcampaignsbystatusapi
```
