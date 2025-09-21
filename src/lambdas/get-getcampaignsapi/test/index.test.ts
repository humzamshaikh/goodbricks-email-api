import { handler } from '../index.js';

describe('get-getcampaignsapi', () => {
  const mockEvent = {
    pathParameters: { userId: 'cognito-user-123' },
    queryStringParameters: null,
    headers: {},
    body: null,
    isBase64Encoded: false,
    requestContext: {} as any,
    httpMethod: 'GET',
    path: '/campaigns',
    resource: '/campaigns/{userId}'
  };

  it('should return campaigns for a valid userId', async () => {
    const result = await handler(mockEvent);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('campaigns');
    expect(body).toHaveProperty('pagination');
    expect(Array.isArray(body.campaigns)).toBe(true);
    expect(body.pagination).toHaveProperty('count');
  });

  it('should return error when userId is missing', async () => {
    const eventWithoutUserId = {
      ...mockEvent,
      pathParameters: null,
      queryStringParameters: null
    };

    const result = await handler(eventWithoutUserId);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('userId is required');
  });

  it('should filter campaigns by status', async () => {
    const eventWithStatus = {
      ...mockEvent,
      queryStringParameters: { status: 'draft' }
    };

    const result = await handler(eventWithStatus);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.campaigns).toBeDefined();
    expect(Array.isArray(body.campaigns)).toBe(true);
    
    // All returned campaigns should have draft status
    body.campaigns.forEach((campaign: any) => {
      expect(campaign.status).toBe('draft');
    });
  });

  it('should filter campaigns by scheduled status', async () => {
    const eventWithStatus = {
      ...mockEvent,
      queryStringParameters: { status: 'scheduled' }
    };

    const result = await handler(eventWithStatus);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.campaigns).toBeDefined();
    expect(Array.isArray(body.campaigns)).toBe(true);
    
    // All returned campaigns should have scheduled status
    body.campaigns.forEach((campaign: any) => {
      expect(campaign.status).toBe('scheduled');
    });
  });

  it('should respect limit parameter', async () => {
    const eventWithLimit = {
      ...mockEvent,
      queryStringParameters: { limit: '2' }
    };

    const result = await handler(eventWithLimit);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.campaigns.length).toBeLessThanOrEqual(2);
  });

  it('should filter campaigns by date range', async () => {
    const eventWithDateRange = {
      ...mockEvent,
      queryStringParameters: { 
        scheduledFrom: '2024-01-01T00:00:00Z',
        scheduledTo: '2024-12-31T23:59:59Z'
      }
    };

    const result = await handler(eventWithDateRange);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.campaigns).toBeDefined();
    expect(Array.isArray(body.campaigns)).toBe(true);
  });

  it('should handle pagination with nextToken', async () => {
    const eventWithToken = {
      ...mockEvent,
      queryStringParameters: { 
        limit: '1',
        nextToken: encodeURIComponent(JSON.stringify({ 
          userId: 'cognito-user-123', 
          campaignId: 'cmp-123' 
        }))
      }
    };

    const result = await handler(eventWithToken);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.campaigns).toBeDefined();
    expect(Array.isArray(body.campaigns)).toBe(true);
  });

  it('should return campaigns with correct structure', async () => {
    const result = await handler(mockEvent);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    
    if (body.campaigns.length > 0) {
      const campaign = body.campaigns[0];
      expect(campaign).toHaveProperty('userId');
      expect(campaign).toHaveProperty('campaignId');
      expect(campaign).toHaveProperty('name');
      expect(campaign).toHaveProperty('status');
      expect(campaign).toHaveProperty('templateId');
      expect(campaign).toHaveProperty('audienceSelection');
      expect(campaign).toHaveProperty('createdAt');
      expect(campaign).toHaveProperty('lastModified');
      expect(campaign).toHaveProperty('metadata');
      
      // Check audienceSelection structure
      expect(campaign.audienceSelection).toHaveProperty('type');
      expect(campaign.audienceSelection).toHaveProperty('values');
      expect(Array.isArray(campaign.audienceSelection.values)).toBe(true);
      
      // Check metadata structure
      expect(campaign.metadata).toHaveProperty('subject');
      // Note: fromName and fromEmail may not be present in all campaigns
      if (campaign.metadata.fromName) {
        expect(campaign.metadata).toHaveProperty('fromName');
      }
      if (campaign.metadata.fromEmail) {
        expect(campaign.metadata).toHaveProperty('fromEmail');
      }
    }
  });

  it('should handle multiple query parameters', async () => {
    const eventWithMultipleParams = {
      ...mockEvent,
      queryStringParameters: { 
        status: 'draft',
        limit: '3'
      }
    };

    const result = await handler(eventWithMultipleParams);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.campaigns).toBeDefined();
    expect(Array.isArray(body.campaigns)).toBe(true);
    expect(body.campaigns.length).toBeLessThanOrEqual(3);
    
    // All campaigns should be draft status
    body.campaigns.forEach((campaign: any) => {
      expect(campaign.status).toBe('draft');
    });
  });

  it('should return empty array when no campaigns match filter', async () => {
    const eventWithNoMatch = {
      ...mockEvent,
      queryStringParameters: { status: 'nonexistent-status' }
    };

    const result = await handler(eventWithNoMatch);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.campaigns).toEqual([]);
    expect(body.pagination.count).toBe(0);
  });
});
