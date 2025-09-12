import { respondWithOk, LambdaResponse, withErrors } from './http.js';

export interface ApiGatewayEventLike {
  queryStringParameters?: Record<string, string> | null;
  pathParameters?: Record<string, string> | null;
  headers?: Record<string, string> | null;
  body?: string | null;
}

export type BusinessHandler<TEvent = ApiGatewayEventLike> = (
  event: TEvent
) => Promise<unknown> | unknown;

export function createHttpHandler<TEvent = ApiGatewayEventLike>(
  fn: BusinessHandler<TEvent>
): (event: TEvent, context?: unknown) => Promise<LambdaResponse> {
  return withErrors<TEvent>(async (event) => {
    const result = await fn(event);
    return respondWithOk(result);
  });
}
