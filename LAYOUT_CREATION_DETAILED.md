# Layout Creation Process - Detailed Breakdown

This document explains exactly what happens when you create a layout using the `POST /create-layout` API, including all DynamoDB records and S3 files that are created.

## API Call

**Endpoint:** `POST /create-layout`  
**Purpose:** Create a reusable email template with personalization variables

### Request Example:
```json
{
  "name": "impact-report",
  "description": "Annual impact report template",
  "category": "newsletters",
  "jsxCode": "import React from 'react';\n\nexport default function ImpactReport({ firstName = 'Friend' }) {\n  return (\n    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto' }}>\n      <h1>GoodBricks Impact Report</h1>\n      <h2>Dear {firstName},</h2>\n      <p>Thank you for your support this year!</p>\n      <div style={{ backgroundColor: '#f0f0f0', padding: '20px', textAlign: 'center' }}>\n        <h3>Our Impact</h3>\n        <p>2,847 lives changed</p>\n      </div>\n    </div>\n  );\n}"
}
```

---

## What Gets Created

### 1. S3 Files (2 files created)

#### **S3 Bucket Structure:**
```
gb-email-layouts-{account-id}-{region}/
├── impact-report/
│   ├── v1.0.0/                    # Version-specific directory
│   │   └── impact-report.jsx      # Versioned JSX file
│   └── latest/                    # Latest version directory
│       └── impact-report.jsx      # Latest JSX file (symlink to current version)
```

#### **File 1: Versioned JSX File**
- **Path:** `impact-report/v1.0.0/impact-report.jsx`
- **Content:** The JSX code from the request
- **Content-Type:** `text/javascript`
- **Metadata:**
  ```json
  {
    "layout-id": "impact-report",
    "version": "v1.0.0",
    "name": "impact-report",
    "description": "Annual impact report template",
    "category": "newsletters",
    "uploaded-at": "2025-01-05T03:23:18.228Z"
  }
  ```

#### **File 2: Latest JSX File**
- **Path:** `impact-report/latest/impact-report.jsx`
- **Content:** Same JSX code as versioned file
- **Content-Type:** `text/javascript`
- **Metadata:**
  ```json
  {
    "layout-id": "impact-report",
    "version": "latest",
    "name": "impact-report",
    "description": "Annual impact report template",
    "category": "newsletters",
    "uploaded-at": "2025-01-05T03:23:18.228Z"
  }
  ```

---

### 2. DynamoDB Records (4 records created)

#### **Table:** `goodbricks-email-main`

#### **Record 1: Primary Layout Metadata (Versioned)**
```json
{
  "PK": "LAYOUT#impact-report",
  "SK": "VERSION#v1.0.0",
  "layoutId": "impact-report",
  "version": "v1.0.0",
  "name": "impact-report",
  "description": "Annual impact report template",
  "category": "newsletters",
  "s3Path": "impact-report/v1.0.0/",
  "s3JsxPath": "impact-report/v1.0.0/impact-report.jsx",
  "isUniversal": true,
  "createdAt": "2025-01-05T03:23:18.228Z",
  "lastModified": "2025-01-05T03:23:18.228Z",
  "createdBy": "system"
}
```

#### **Record 2: Primary Layout Metadata (Latest)**
```json
{
  "PK": "LAYOUT#impact-report",
  "SK": "VERSION#latest",
  "layoutId": "impact-report",
  "version": "latest",
  "name": "impact-report",
  "description": "Annual impact report template",
  "category": "newsletters",
  "s3Path": "impact-report/latest/",
  "s3JsxPath": "impact-report/latest/impact-report.jsx",
  "isUniversal": true,
  "createdAt": "2025-01-05T03:23:18.228Z",
  "lastModified": "2025-01-05T03:23:18.228Z",
  "createdBy": "system"
}
```

#### **Record 3: Category Index (Versioned)**
```json
{
  "PK": "LAYOUT_CATEGORY#newsletters",
  "SK": "LAYOUT#impact-report#VERSION#v1.0.0",
  "layoutId": "impact-report",
  "version": "v1.0.0",
  "category": "newsletters",
  "name": "impact-report",
  "description": "Annual impact report template",
  "s3Path": "impact-report/v1.0.0/",
  "s3JsxPath": "impact-report/v1.0.0/impact-report.jsx",
  "isUniversal": true,
  "createdAt": "2025-01-05T03:23:18.228Z",
  "lastModified": "2025-01-05T03:23:18.228Z"
}
```

#### **Record 4: Category Index (Latest)**
```json
{
  "PK": "LAYOUT_CATEGORY#newsletters",
  "SK": "LAYOUT#impact-report#VERSION#latest",
  "layoutId": "impact-report",
  "version": "latest",
  "category": "newsletters",
  "name": "impact-report",
  "description": "Annual impact report template",
  "s3Path": "impact-report/latest/",
  "s3JsxPath": "impact-report/latest/impact-report.jsx",
  "isUniversal": true,
  "createdAt": "2025-01-05T03:23:18.228Z",
  "lastModified": "2025-01-05T03:23:18.228Z"
}
```

---

## Layout ID Generation

The layout ID is automatically generated from the name using this logic:

```javascript
// Convert name to lowercase and replace non-alphanumeric characters with hyphens
layoutId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');

// Example:
// name: "Impact Report" → layoutId: "impact-report"
// name: "Welcome Email!" → layoutId: "welcome-email"
// name: "Newsletter #1" → layoutId: "newsletter-1"
```

---

## Version Management

### Version Numbering:
- **First version:** `v1.0.0`
- **Subsequent versions:** Incremented automatically
  - `v1.0.0` → `v1.0.1` → `v1.0.2` → `v1.1.0` → `v2.0.0`

### Version Strategy:
1. **Versioned Files:** Store each version separately for history
2. **Latest Files:** Always point to the most recent version
3. **Automatic Updates:** When a new version is created, the `latest` files are updated

---

## JSX Processing

### Variable Detection:
The system automatically detects personalization variables from the JSX code:

```javascript
// From: export default function ImpactReport({ firstName = 'Friend' }) {
// Detected: ["firstName"]
```

### HTML Rendering:
The JSX is compiled to HTML with template variables:

```html
<!-- Input JSX -->
<h2>Dear {firstName},</h2>

<!-- Output HTML -->
<h2>Dear {{firstName}},</h2>
```

---

## Database Query Patterns

### Get Layout by ID:
```javascript
// Query primary metadata
PK = "LAYOUT#impact-report" AND SK = "VERSION#latest"
```

### Get All Layouts by Category:
```javascript
// Query category index
PK = "LAYOUT_CATEGORY#newsletters"
```

### Get Specific Version:
```javascript
// Query specific version
PK = "LAYOUT#impact-report" AND SK = "VERSION#v1.0.0"
```

---

## S3 File Access

### Retrieve JSX Code:
```javascript
// Get latest version
s3Key = "impact-report/latest/impact-report.jsx"

// Get specific version
s3Key = "impact-report/v1.0.0/impact-report.jsx"
```

### File Metadata:
Each S3 file includes metadata for:
- Layout identification
- Version tracking
- Upload timestamps
- Category information

---

## Response Format

### Successful Creation Response:
```json
{
  "success": true,
  "layoutId": "impact-report",
  "version": "v1.0.0",
  "s3Key": "impact-report/v1.0.0/impact-report.jsx",
  "bucketName": "gb-email-layouts-900546257868-us-west-1",
  "metadata": {
    "name": "impact-report",
    "description": "Annual impact report template",
    "category": "newsletters",
    "uploadedAt": "2025-01-05T03:23:18.228Z"
  },
  "dynamoItems": 4,
  "isFirstVersion": true,
  "latestVersionCreated": true,
  "renderedHtml": "<!DOCTYPE html>...",
  "detectedVariables": ["firstName"]
}
```

---

## Error Handling

### Common Errors:
1. **Duplicate Layout ID:** If layout already exists
2. **Invalid JSX:** If JSX code has syntax errors
3. **S3 Upload Failure:** If file upload fails
4. **DynamoDB Write Failure:** If database write fails

### Rollback Strategy:
If any step fails, the system attempts to clean up:
- Remove uploaded S3 files
- Delete created DynamoDB records
- Return error with details

---

## Usage in Campaigns

### Campaign Reference:
When a campaign uses this layout:
```json
{
  "layoutId": "impact-report",
  "layoutVersion": "latest"  // or specific version like "v1.0.0"
}
```

### Template Creation:
The layout is used to create SES templates:
- **Template Name:** `{cognitoId}_{campaignId}`
- **Variables:** Extracted from JSX (`firstName`)
- **Content:** Rendered HTML from JSX

---

## Summary

When you create a layout, the system:

1. **Generates** a unique layout ID from the name
2. **Creates** 2 S3 files (versioned + latest)
3. **Creates** 4 DynamoDB records (metadata + category indexes)
4. **Processes** JSX to detect personalization variables
5. **Renders** JSX to HTML for preview
6. **Returns** complete creation details

This creates a robust, versioned template system that supports:
- ✅ **Version History:** Keep track of all layout versions
- ✅ **Category Organization:** Group layouts by type
- ✅ **Variable Detection:** Automatic personalization support
- ✅ **S3 Storage:** Efficient file storage and retrieval
- ✅ **DynamoDB Indexing:** Fast queries by ID and category
- ✅ **Latest Tracking:** Always know the current version
