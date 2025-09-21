import { handler } from '../index.js';

describe('post-sendcampaignapi', () => {
  const mockEvent = {
    pathParameters: { userId: 'cognito-user-123', campaignId: 'cmp-123' },
    queryStringParameters: null,
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    isBase64Encoded: false,
    requestContext: {} as any,
    httpMethod: 'POST',
    path: '/send-campaign',
    resource: '/send-campaign/{userId}/{campaignId}'
  };


  it('should return error when userId is missing', async () => {
    const eventWithoutUserId = {
      ...mockEvent,
      pathParameters: { campaignId: 'cmp-123' }
    };

    const result = await handler(eventWithoutUserId);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('userId is required');
  });

  it('should return error when campaignId is missing', async () => {
    const eventWithoutCampaignId = {
      ...mockEvent,
      pathParameters: { userId: 'cognito-user-123' }
    };

    const result = await handler(eventWithoutCampaignId);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('campaignId is required');
  });

  it('should return error when campaign metadata is missing required fields', async () => {
    // This will fail because the campaign doesn't have required metadata
    const result = await handler(mockEvent);
    
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain('Campaign metadata must include fromEmail');
  });
});
