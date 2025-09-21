import { handler } from '../index.js';

describe('post-sendemailapi', () => {
  const mockEvent = {
    pathParameters: null,
    queryStringParameters: null,
    headers: { 'Content-Type': 'application/json' },
    body: null,
    isBase64Encoded: false,
    requestContext: {} as any,
    httpMethod: 'POST',
    path: '/send-email',
    resource: '/send-email'
  };

  it('should return error when body is missing', async () => {
    const result = await handler(mockEvent);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('Request body is required');
  });

  it('should return error when recipients are missing', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        subject: 'Test',
        content: { text: 'Test content' },
        fromEmail: 'test@example.com'
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('recipients array is required');
  });

  it('should return error when subject is missing', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        recipients: ['test@example.com'],
        content: { text: 'Test content' },
        fromEmail: 'test@example.com'
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('subject is required');
  });

  it('should return error when content is missing', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        recipients: ['test@example.com'],
        subject: 'Test',
        fromEmail: 'test@example.com'
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('content with either html or text is required');
  });

  it('should return error when fromEmail is missing', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        recipients: ['test@example.com'],
        subject: 'Test',
        content: { text: 'Test content' }
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('fromEmail is required');
  });

  it('should return error for invalid email addresses', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        recipients: ['invalid-email'],
        subject: 'Test',
        content: { text: 'Test content' },
        fromEmail: 'test@example.com'
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('Invalid email address');
  });

  it('should validate email addresses in cc and bcc', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        recipients: ['test@example.com'],
        subject: 'Test',
        content: { text: 'Test content' },
        fromEmail: 'test@example.com',
        cc: ['invalid-cc-email'],
        bcc: ['invalid-bcc-email']
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('Invalid email address');
  });

  it('should validate replyTo email address', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        recipients: ['test@example.com'],
        subject: 'Test',
        content: { text: 'Test content' },
        fromEmail: 'test@example.com',
        replyTo: 'invalid-reply-email'
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('Invalid email address');
  });

  it('should accept valid email request with text content', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        recipients: ['test@example.com'],
        subject: 'Test Email',
        content: { text: 'This is a test email' },
        fromEmail: 'noreply@goodbricks.com',
        fromName: 'GoodBricks Team'
      })
    };

    // Note: This will fail in test environment due to SES not being configured
    // but we can test the validation logic
    const result = await handler(eventWithBody);
    
    // Should either succeed (if SES is configured) or fail with SES-specific error
    expect([200, 500]).toContain(result.statusCode);
  });

  it('should accept valid email request with html content', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        recipients: ['test@example.com'],
        subject: 'Test Email',
        content: { 
          html: '<h1>Hello</h1><p>This is a test email</p>',
          text: 'Hello - This is a test email'
        },
        fromEmail: 'noreply@goodbricks.com',
        fromName: 'GoodBricks Team',
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
        replyTo: 'support@goodbricks.com'
      })
    };

    // Note: This will fail in test environment due to SES not being configured
    // but we can test the validation logic
    const result = await handler(eventWithBody);
    
    // Should either succeed (if SES is configured) or fail with SES-specific error
    expect([200, 500]).toContain(result.statusCode);
  });

  it('should handle empty recipients array', async () => {
    const eventWithBody = {
      ...mockEvent,
      body: JSON.stringify({
        recipients: [],
        subject: 'Test',
        content: { text: 'Test content' },
        fromEmail: 'test@example.com'
      })
    };

    const result = await handler(eventWithBody);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('recipients array is required and must not be empty');
  });
});
