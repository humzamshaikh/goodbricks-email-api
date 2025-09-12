import { createHttpHandler, ApiGatewayEventLike } from '../../lib/handler.js';

const handlerLogic = (_event: ApiGatewayEventLike) => {
  return {
    ok: true,
    handler: 'src/lambdas/put-addaudiencetogroupapi/index.ts'
  };
};

export const handler = createHttpHandler(handlerLogic);
