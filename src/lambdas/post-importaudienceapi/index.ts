import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { HttpError } from '../../lib/http.js';

// AWS Clients
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-west-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.MAIN_TABLE_NAME || 'goodbricks-email-main';

interface ImportMember {
  email: string;
  firstName?: string;
  lastName?: string;
  tags?: string[]; // groupIds may be in tags; we also accept groupIds separately
  groupIds?: string[];
  status?: 'active' | 'deleted';
  organization?: string;
}

interface ImportAudienceRequest {
  userId: string;
  organization?: string; // Top-level organization for all members
  members: ImportMember[];
  mode?: 'upsert' | 'insert_only';
  appendTags?: boolean; // if true, merge tags; if false, replace when provided
  defaultGroups?: string[]; // groups to add all imported users to
  entityType?: 'AUDIENCE';
}

interface ImportAudienceResponse {
  success: boolean;
  userId: string;
  totals: {
    input: number;
    imported: number;
    updated: number;
    skippedInvalid: number;
  };
  details: Array<{
    email: string;
    action: 'imported' | 'updated' | 'skipped_invalid';
    reason?: string;
  }>;
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

const handlerLogic = async (event: ApiGatewayEventLike): Promise<ImportAudienceResponse> => {
  const body = event.body ? JSON.parse(event.body) as ImportAudienceRequest : undefined;

  if (!body) {
    throw new HttpError(400, 'Request body is required');
  }
  if (!body.userId) {
    throw new HttpError(400, 'userId is required');
  }
  if (!Array.isArray(body.members) || body.members.length === 0) {
    throw new HttpError(400, 'members array is required and must not be empty');
  }

  const userId = body.userId;
  const topLevelOrganization = body.organization; // Get top-level organization
  const nowIso = new Date().toISOString();
  const mode = body.mode ?? 'upsert';
  const appendTags = body.appendTags ?? true;
  const defaultGroups = body.defaultGroups ?? [];

  const dedupedByEmail: Map<string, ImportMember> = new Map();
  const details: ImportAudienceResponse['details'] = [];
  let imported = 0;
  let updated = 0;
  let skippedInvalid = 0;

  // Deduplicate and basic validation
  for (const raw of body.members) {
    const email = (raw.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) {
      skippedInvalid++;
      details.push({ email: raw.email || '', action: 'skipped_invalid', reason: 'invalid_email' });
      continue;
    }
    // prefer last occurrence
    dedupedByEmail.set(email, { ...raw, email });
  }

  // Process each member
  for (const [email, member] of dedupedByEmail.entries()) {
    // Use member tags if provided, otherwise default to empty array
    const memberTags = Array.isArray(member.tags) ? member.tags.filter(Boolean) : [];
    const groupIds = new Set<string>([...memberTags, ...(member.groupIds || []), ...defaultGroups]);

    // Use top-level organization if provided, otherwise fall back to member organization
    const organization = topLevelOrganization || member.organization || '';

    // Upsert the primary audience record
    const audienceItem = {
      PK: `USER#${userId}`,
      SK: `AUDIENCE#${email}`,
      entityType: 'AUDIENCE',
      userId,
      email,
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      tags: Array.from(groupIds),
      status: member.status || 'active',
      organization: organization,
      createdAt: nowIso,
      lastModified: nowIso
    };

    try {
      if (mode === 'insert_only') {
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: audienceItem,
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
        }));
        imported++;
        details.push({ email, action: 'imported' });
      } else {
        // upsert: try update existing (merge tags if appendTags)
        if (appendTags) {
          await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: `AUDIENCE#${email}` },
            UpdateExpression: 'SET #firstName = :firstName, #lastName = :lastName, #organization = :org, #status = :status, #lastModified = :lm ADD #tags :newTags',
            ExpressionAttributeNames: {
              '#firstName': 'firstName',
              '#lastName': 'lastName',
              '#organization': 'organization',
              '#status': 'status',
              '#lastModified': 'lastModified',
              '#tags': 'tags'
            },
            ExpressionAttributeValues: {
              ':firstName': audienceItem.firstName,
              ':lastName': audienceItem.lastName,
              ':org': audienceItem.organization,
              ':status': audienceItem.status,
              ':lm': nowIso,
              // For SET/ADD on sets we should use a set type; to keep simple, replace below if needed.
              // Here we fallback to full replace when ADD on lists is not supported by DocumentClient v3.
            },
            ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
          })).catch(async () => {
            // If not exists, create it
            await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: audienceItem }));
            imported++;
            details.push({ email, action: 'imported' });
            return;
          });
          // If update succeeded
          if (!details.find(d => d.email === email && d.action === 'imported')) {
            updated++;
            details.push({ email, action: 'updated' });
          }
        } else {
          // replace tags
          await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${userId}`, SK: `AUDIENCE#${email}` },
            UpdateExpression: 'SET #firstName = :firstName, #lastName = :lastName, #organization = :org, #status = :status, #tags = :tags, #lastModified = :lm',
            ExpressionAttributeNames: {
              '#firstName': 'firstName',
              '#lastName': 'lastName',
              '#organization': 'organization',
              '#status': 'status',
              '#tags': 'tags',
              '#lastModified': 'lastModified'
            },
            ExpressionAttributeValues: {
              ':firstName': audienceItem.firstName,
              ':lastName': audienceItem.lastName,
              ':org': audienceItem.organization,
              ':status': audienceItem.status,
              ':tags': audienceItem.tags,
              ':lm': nowIso
            },
            ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
          })).catch(async () => {
            await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: audienceItem }));
            imported++;
            details.push({ email, action: 'imported' });
            return;
          });
          if (!details.find(d => d.email === email && d.action === 'imported')) {
            updated++;
            details.push({ email, action: 'updated' });
          }
        }
      }
    } catch (e) {
      skippedInvalid++;
      details.push({ email, action: 'skipped_invalid', reason: e instanceof Error ? e.message : 'unknown_error' });
      continue;
    }

    // Create group membership records
    if (groupIds.size > 0) {
      const puts = Array.from(groupIds).map(groupId => ({
        PutRequest: {
          Item: {
            PK: `USER#${userId}#GROUP#${groupId}`,
            SK: `AUDIENCE#${email}`,
            userId,
            groupId,
            email,
            entityType: 'AUDIENCE',
            createdAt: nowIso,
            lastModified: nowIso
          }
        }
      }));

      // Batch write in chunks of 25
      for (let i = 0; i < puts.length; i += 25) {
        const batch = puts.slice(i, i + 25);
        await docClient.send(new BatchWriteCommand({
          RequestItems: { [TABLE_NAME]: batch }
        }));
      }
    }
  }

  return {
    success: true,
    userId,
    totals: {
      input: body.members.length,
      imported,
      updated,
      skippedInvalid
    },
    details
  };
};

export const handler = createHttpHandler(handlerLogic);
