import { handler } from '../index.js';

describe('get-getcampaigndetailsapi', () => {
  const baseEvent = {
    pathParameters: { userId: 'cognito-user-123', campaignId: 'cmp-123' },
    queryStringParameters: null,
    headers: {},
    body: null,
    isBase64Encoded: false,
    requestContext: {} as any,
    httpMethod: 'GET',
    path: '/campaigns/details',
    resource: '/campaigns/{userId}/{campaignId}'
  };

  it('errors when userId missing', async () => {
    const ev = { ...baseEvent, pathParameters: { campaignId: 'cmp-123' } } as any;
    const result = await handler(ev);
    expect(result.statusCode).toBe(500);
  });

  it('errors when campaignId missing', async () => {
    const ev = { ...baseEvent, pathParameters: { userId: 'cognito-user-123' } } as any;
    const result = await handler(ev);
    expect(result.statusCode).toBe(500);
  });

  it('returns 200 with a body object (found or not)', async () => {
    const result = await handler(baseEvent as any);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(typeof body).toBe('object');
  });
});
