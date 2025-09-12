import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';

const handlerLogic = (_event: ApiGatewayEventLike) => {
  return { message: 'Sample lambda' };
};

export const handler = createHttpHandler(handlerLogic);
