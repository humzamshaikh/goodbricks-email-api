import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';

const handlerLogic = (event: ApiGatewayEventLike) => {
  const name = event?.queryStringParameters?.name || 'World';
  return { message: `Hello, ${name}!` };
};

export const handler = createHttpHandler(handlerLogic);
