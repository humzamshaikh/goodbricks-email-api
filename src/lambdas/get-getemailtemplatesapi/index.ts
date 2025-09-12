import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';

const handlerLogic = (event: ApiGatewayEventLike) => {
  return {
    success: true,
    data: {
      message: 'Hello from get-getemailtemplatesapi!',
      event: event
    }
  };
};

export const handler = createHttpHandler(handlerLogic);