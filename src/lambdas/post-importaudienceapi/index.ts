import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
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
  organization?: string;
}

interface ImportAudienceRequest {
  cognitoId: string;
  organization?: string; // Top-level organization for all members
  members: ImportMember[];
}

interface ImportAudienceResponse {
  success: boolean;
  cognitoId: string;
  totals: {
    input: number;
    imported: number;
    skippedInvalid: number;
  };
  details: Array<{
    email: string;
    action: 'imported' | 'skipped_invalid';
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
  if (!body.cognitoId) {
    throw new HttpError(400, 'cognitoId is required');
  }
  if (!Array.isArray(body.members) || body.members.length === 0) {
    throw new HttpError(400, 'members array is required and must not be empty');
  }

  const cognitoId = body.cognitoId;
  const topLevelOrganization = body.organization; // Get top-level organization
  const nowIso = new Date().toISOString();

  const dedupedByEmail: Map<string, ImportMember> = new Map();
  const details: ImportAudienceResponse['details'] = [];
  let imported = 0;
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
    // Use top-level organization if provided, otherwise fall back to member organization
    const organization = topLevelOrganization || member.organization || '';

    // Create the primary audience record
    const audienceItem = {
      PK: `USER#${cognitoId}`,
      SK: `AUDIENCE#${email}`,
      userId: cognitoId,
      email: email,
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      lastModified: nowIso,
      createdAt: nowIso,
      organization: organization,
      entityType: 'AUDIENCE'
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: audienceItem,
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
      }));
      imported++;
      details.push({ email, action: 'imported' });
    } catch (e) {
      skippedInvalid++;
      details.push({ email, action: 'skipped_invalid', reason: e instanceof Error ? e.message : 'unknown_error' });
      continue;
    }
  }

  return {
    success: true,
    cognitoId,
    totals: {
      input: body.members.length,
      imported,
      skippedInvalid
    },
    details
  };
};

export const handler = createHttpHandler(handlerLogic);
