import { handler } from '../index.js';
import event from '../requests/request.json' with { type: 'json' };

test('sample-lambda returns Sample lambda', async () => {
  const res = await handler(event as any, {} as any);
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.message).toBe('Sample lambda');
});
