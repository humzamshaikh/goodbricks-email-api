import { respondWithOk, respondWithBadRequest, respondWithNotFound, json } from '../http.js';

test('respondWithOk returns 200 with JSON body', () => {
  const res = respondWithOk({ foo: 'bar' });
  expect(res.statusCode).toBe(200);
  expect(res.headers['Content-Type']).toBe('application/json');
  expect(JSON.parse(res.body).foo).toBe('bar');
});

test('respondWithBadRequest returns 400 with error message', () => {
  const res = respondWithBadRequest('Missing');
  expect(res.statusCode).toBe(400);
  expect(JSON.parse(res.body).error).toBe('Missing');
});

test('respondWithNotFound returns 404 with error message', () => {
  const res = respondWithNotFound('Nope');
  expect(res.statusCode).toBe(404);
  expect(JSON.parse(res.body).error).toBe('Nope');
});

test('json returns custom status and merges headers', () => {
  const res = json(201, { ok: true }, { 'X-Test': '1' });
  expect(res.statusCode).toBe(201);
  expect(res.headers['X-Test']).toBe('1');
  expect(JSON.parse(res.body).ok).toBe(true);
});
