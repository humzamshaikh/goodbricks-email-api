import { handler } from '../index.js';

describe('get-getaudiencegroupapi', () => {
  const baseEvent = {
    pathParameters: { userId: 'cognito-user-123', group: 'subscribed' },
    queryStringParameters: null,
    headers: {},
    body: null,
    isBase64Encoded: false,
    requestContext: {} as any,
    httpMethod: 'GET',
    path: '/audience/group',
    resource: '/audience/{userId}/group/{group}'
  };

  it('returns members for user and group', async () => {
    const result = await handler(baseEvent as any);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(Array.isArray(body.audience)).toBe(true);
  });

  it('errors when userId missing', async () => {
    const ev = { ...baseEvent, pathParameters: { group: 'subscribed' } } as any;
    const result = await handler(ev);
    expect(result.statusCode).toBe(500);
  });

  it('errors when group missing', async () => {
    const ev = { ...baseEvent, pathParameters: { userId: 'cognito-user-123' } } as any;
    const result = await handler(ev);
    expect(result.statusCode).toBe(500);
  });
});
