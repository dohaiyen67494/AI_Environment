import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { DPoPRequest } from './dpop.guard';
import { DPoPPayload, JWK } from './dpop.types';

/**
 * Parameter decorator to inject the verified DPoP context (payload and JWK)
 * Usage:
 *   @Get()
 *   @UseGuards(DPoPGuard)
 *   myEndpoint(@CurrentDPoP() dpop: { payload: DPoPPayload; jwk: JWK })
 */
export const CurrentDPoP = createParamDecorator(
  (data: keyof DPoPRequest['dpop'] | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<DPoPRequest>();
    if (!request.dpop) {
      return null;
    }
    return data ? request.dpop[data] : request.dpop;
  },
);

/**
 * Parameter decorator to inject the verified client public JWK directly
 * Usage:
 *   @Get()
 *   @UseGuards(DPoPGuard)
 *   myEndpoint(@CurrentDPoPJwk() jwk: JWK)
 */
export const CurrentDPoPJwk = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JWK | null => {
    const request = ctx.switchToHttp().getRequest<DPoPRequest>();
    return request.dpop ? request.dpop.jwk : null;
  },
);
