import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';

const handlerLogic = (_event: ApiGatewayEventLike) => {
  return {
    ok: true,
    handler: 'new src/lambdas/get-getaudiencegroupapi/index.ts'
  };
};

export const handler = createHttpHandler(handlerLogic);
