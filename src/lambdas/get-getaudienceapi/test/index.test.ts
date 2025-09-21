import { handler } from '../index.js';

describe('get-getaudienceapi', () => {
  const mockEvent = {
    pathParameters: { userId: 'cognito-user-123' },
    queryStringParameters: null,
    headers: {},
    body: null,
    isBase64Encoded: false,
    requestContext: {} as any,
    httpMethod: 'GET',
    path: '/audience',
    resource: '/audience'
  };

  it('should return audience for a valid userId', async () => {
    const result = await handler(mockEvent);
    
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({
      audience: expect.any(Array),
      pagination: {
        count: expect.any(Number)
      }
    });
  });

  it('should return error when userId is missing', async () => {
    const eventWithoutUserId = {
      ...mockEvent,
      pathParameters: null,
      queryStringParameters: null
    };

    const result = await handler(eventWithoutUserId);
    
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toMatchObject({
      error: 'Internal Server Error'
    });
  });

  it('should filter by tag when tag parameter is provided', async () => {
    const eventWithTag = {
      ...mockEvent,
      queryStringParameters: { tag: 'subscribed' }
    };

    const result = await handler(eventWithTag);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.audience).toBeDefined();
    expect(Array.isArray(body.audience)).toBe(true);
  });

  it('should filter by status when status parameter is provided', async () => {
    const eventWithStatus = {
      ...mockEvent,
      queryStringParameters: { status: 'active' }
    };

    const result = await handler(eventWithStatus);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.audience).toBeDefined();
    expect(Array.isArray(body.audience)).toBe(true);
  });

  it('should respect limit parameter', async () => {
    const eventWithLimit = {
      ...mockEvent,
      queryStringParameters: { limit: '2' }
    };

    const result = await handler(eventWithLimit);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.audience.length).toBeLessThanOrEqual(2);
  });

  it('should handle pagination with nextToken', async () => {
    const eventWithToken = {
      ...mockEvent,
      queryStringParameters: { 
        limit: '1',
        nextToken: encodeURIComponent(JSON.stringify({ 
          PK: 'USER#cognito-user-123', 
          SK: 'AUDIENCE#test@example.com' 
        }))
      }
    };

    const result = await handler(eventWithToken);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.audience).toBeDefined();
    expect(Array.isArray(body.audience)).toBe(true);
  });

  it('should return audience members with correct structure', async () => {
    const result = await handler(mockEvent);
    
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    
    if (body.audience.length > 0) {
      const member = body.audience[0];
      expect(member).toHaveProperty('userId');
      expect(member).toHaveProperty('email');
      expect(member).toHaveProperty('firstName');
      expect(member).toHaveProperty('lastName');
      expect(member).toHaveProperty('tags');
      expect(member).toHaveProperty('lastModified');
      expect(Array.isArray(member.tags)).toBe(true);
    }
  });
});
