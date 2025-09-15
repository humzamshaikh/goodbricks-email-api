import { handler } from '../index.js';
import baseEvent from '../requests/request.json' with { type: 'json' };

describe('get-getemailtemplatesapi', () => {
  test('should return all templates without query parameters', async () => {
    const res = await handler(baseEvent as any, {} as any);
    
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('templates');
    expect(body.data).toHaveProperty('count');
    expect(body.data).toHaveProperty('query');
  });

  test('should filter templates by category', async () => {
    const event = {
      ...baseEvent,
      queryStringParameters: {
        category: 'onboarding'
      }
    };

    const res = await handler(event as any, {} as any);
    
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.query.category).toBe('onboarding');
  });

  test('should search templates by text', async () => {
    const event = {
      ...baseEvent,
      queryStringParameters: {
        search: 'welcome'
      }
    };

    const res = await handler(event as any, {} as any);
    
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.query.search).toBe('welcome');
  });

  test('should include template content when requested', async () => {
    const event = {
      ...baseEvent,
      queryStringParameters: {
        includeContent: 'true'
      }
    };

    const res = await handler(event as any, {} as any);
    
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.query.includeContent).toBe(true);
  });

  test('should limit results when limit parameter is provided', async () => {
    const event = {
      ...baseEvent,
      queryStringParameters: {
        limit: '2'
      }
    };

    const res = await handler(event as any, {} as any);
    
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.query.limit).toBe(2);
  });

  test('should handle multiple query parameters', async () => {
    const event = {
      ...baseEvent,
      queryStringParameters: {
        category: 'marketing',
        search: 'newsletter',
        includeContent: 'true',
        limit: '5'
      }
    };

    const res = await handler(event as any, {} as any);
    
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.query).toEqual({
      category: 'marketing',
      search: 'newsletter',
      includeContent: true,
      limit: 5,
      activeOnly: true
    });
  });
});
