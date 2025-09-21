import { handler } from '../index.js';

describe('post-createcampaignapi', () => {
  const mockEvent = {
    pathParameters: { userId: 'cognito-user-123' },
    queryStringParameters: null,
    headers: { 'Content-Type': 'application/json' },
    body: null,
    isBase64Encoded: false,
    requestContext: {} as any,
    httpMethod: 'POST',
    path: '/campaigns',
    resource: '/campaigns/{userId}'
  };

  it('should create a campaign with valid data', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        name: 'Test Campaign',
        description: 'Test campaign description',
        templateId: 'welcome',
        templateVersion: 1,
        audienceSelection: {
          type: 'tag',
          values: ['subscribed']
        },
        status: 'draft',
        metadata: {
          subject: 'Test Subject',
          fromName: 'Test Sender',
          fromEmail: 'test@example.com'
        }
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.campaignId).toBeDefined();
    expect(body.message).toBe('Campaign created');
    expect(body.campaign).toHaveProperty('userId', 'cognito-user-123');
    expect(body.campaign).toHaveProperty('name', 'Test Campaign');
    expect(body.campaign).toHaveProperty('templateId', 'welcome');
    expect(body.campaign).toHaveProperty('status', 'draft');
  });

  it('should return error when userId is missing', async () => {
    const eventWithoutUserId = {
      ...mockEvent,
      pathParameters: null,
      body: JSON.stringify({
        name: 'Test Campaign',
        templateId: 'welcome',
        audienceSelection: { type: 'tag', values: ['subscribed'] }
      })
    };

    const result = await handler(eventWithoutUserId);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('userId is required');
  });

  it('should return error when name is missing', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        templateId: 'welcome',
        audienceSelection: { type: 'tag', values: ['subscribed'] }
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('name, templateId, and audienceSelection are required');
  });

  it('should return error when templateId is missing', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        name: 'Test Campaign',
        audienceSelection: { type: 'tag', values: ['subscribed'] }
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('name, templateId, and audienceSelection are required');
  });

  it('should return error when audienceSelection is missing', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        name: 'Test Campaign',
        templateId: 'welcome'
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('name, templateId, and audienceSelection are required');
  });

  it('should create campaign with minimal required data', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        name: 'Minimal Campaign',
        templateId: 'welcome',
        audienceSelection: { type: 'all', values: [] }
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.campaign.name).toBe('Minimal Campaign');
    expect(body.campaign.templateId).toBe('welcome');
    expect(body.campaign.audienceSelection.type).toBe('all');
    expect(body.campaign.status).toBe('draft'); // Default status
  });

  it('should create campaign with all optional fields', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        name: 'Full Campaign',
        description: 'Full campaign description',
        templateId: 'newsletter',
        templateVersion: 3,
        audienceSelection: {
          type: 'list',
          values: ['user1@example.com', 'user2@example.com']
        },
        status: 'scheduled',
        scheduledAt: '2024-12-25T10:00:00Z',
        metadata: {
          subject: 'Holiday Newsletter',
          fromName: 'Holiday Team',
          fromEmail: 'holiday@example.com',
          previewText: 'Check out our holiday specials!'
        }
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.campaign.name).toBe('Full Campaign');
    expect(body.campaign.description).toBe('Full campaign description');
    expect(body.campaign.templateVersion).toBe(3);
    expect(body.campaign.status).toBe('scheduled');
    expect(body.campaign.scheduledAt).toBe('2024-12-25T10:00:00Z');
    expect(body.campaign.metadata.previewText).toBe('Check out our holiday specials!');
  });

  it('should handle different audience selection types', async () => {
    const testCases = [
      { type: 'tag', values: ['subscribed', 'vip'] },
      { type: 'list', values: ['user1@example.com', 'user2@example.com'] },
      { type: 'all', values: [] }
    ];

    for (const audienceSelection of testCases) {
      const eventWithBody = {
        ...mockEvent,
        body: JSON.stringify({
          name: `Campaign ${audienceSelection.type}`,
          templateId: 'welcome',
          audienceSelection
        })
      };

      const result = await handler(eventWithBody);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.campaign.audienceSelection.type).toBe(audienceSelection.type);
      expect(body.campaign.audienceSelection.values).toEqual(audienceSelection.values);
    }
  });

  it('should generate unique campaign IDs', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        name: 'Unique Campaign Test',
        templateId: 'welcome',
        audienceSelection: { type: 'tag', values: ['subscribed'] }
      })
    };

    const result1 = await handler(eventWithBody);
    const result2 = await handler(eventWithBody);
    
    expect(result1.statusCode).toBe(200);
    expect(result2.statusCode).toBe(200);
    
    const body1 = JSON.parse(result1.body);
    const body2 = JSON.parse(result2.body);
    
    expect(body1.campaignId).toBeDefined();
    expect(body2.campaignId).toBeDefined();
    expect(body1.campaignId).not.toBe(body2.campaignId);
  });

  it('should set default values correctly', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        name: 'Default Values Test',
        templateId: 'welcome',
        audienceSelection: { type: 'tag', values: ['subscribed'] }
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.campaign.templateVersion).toBe(1); // Default version
    expect(body.campaign.status).toBe('draft'); // Default status
    expect(body.campaign.metadata).toEqual({}); // Default empty metadata
    expect(body.campaign.createdAt).toBeDefined();
    expect(body.campaign.lastModified).toBeDefined();
  });

  it('should handle invalid audience selection type', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        name: 'Invalid Audience Test',
        templateId: 'welcome',
        audienceSelection: { type: 'invalid', values: ['subscribed'] }
      })
    };

    // This should still work as the API doesn't validate the type enum
    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.campaign.audienceSelection.type).toBe('invalid');
  });

  it('should handle empty body', async () => {
    const eventWithEmptyBody = {
      ...mockEvent,
      body: null
    };

    const result = await handler(eventWithEmptyBody);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('name, templateId, and audienceSelection are required');
  });
});
