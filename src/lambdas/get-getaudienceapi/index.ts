import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';

const handlerLogic = (_event: ApiGatewayEventLike) => {
  return {
    ok: true,
    handler: 'updated src/lambdas/get-getaudienceapi/index.ts'
  };
};

export const handler = createHttpHandler(handlerLogic);
