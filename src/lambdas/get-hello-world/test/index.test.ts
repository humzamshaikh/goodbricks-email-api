import { handler } from '../index.js';
import baseEvent from '../requests/request.json' with { type: 'json' };

test('sayHelloWorld returns Hello, World! by default', async () => {
  const res = await handler(baseEvent as any, {} as any);
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.message).toBe('Hello, World!');
});

test('sayHelloWorld greets by provided name', async () => {
  const event = { ...(baseEvent as any), queryStringParameters: { name: 'Alice' } } as any;
  const res = await handler(event, {} as any);
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.message).toBe('Hello, Alice!');
});
