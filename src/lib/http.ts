export type JsonHeaders = Record<string, string>;

export interface LambdaResponse {
  statusCode: number;
  headers: JsonHeaders;
  body: string;
}

export const defaultCorsHeaders: JsonHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
};

export function json(statusCode: number, body: unknown, headers: JsonHeaders = {}): LambdaResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...defaultCorsHeaders,
      ...headers
    },
    body: JSON.stringify(body)
  };
}

export function respondWithOk(body: unknown, headers: JsonHeaders = {}): LambdaResponse {
  return json(200, body, headers);
}

export function respondWithBadRequest(
  message: string = 'Bad Request',
  headers: JsonHeaders = {}
): LambdaResponse {
  return json(400, { error: message }, headers);
}

export function respondWithNotFound(
  message: string = 'Not Found',
  headers: JsonHeaders = {}
): LambdaResponse {
  return json(404, { error: message }, headers);
}

export class HttpError extends Error {
  statusCode: number;
  details?: unknown;
  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function toErrorResponse(err: unknown): LambdaResponse {
  if (err instanceof HttpError) {
    return json(err.statusCode, { error: err.message, details: err.details });
  }
  return json(500, { error: 'Internal Server Error' });
}

type AsyncHandler<TEvent> = (event: TEvent, context?: unknown) => Promise<LambdaResponse>;

export function withErrors<TEvent>(handler: AsyncHandler<TEvent>): AsyncHandler<TEvent> {
  return async (event: TEvent, context?: unknown) => {
    try {
      return await handler(event, context);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}
