import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { DPoPService } from './dpop.service';
import { DPoPPayload, JWK } from './dpop.types';

export interface DPoPRequest extends Request {
  dpop?: {
    payload: DPoPPayload;
    jwk: JWK;
  };
}

@Injectable()
export class DPoPGuard implements CanActivate {
  private readonly logger = new Logger(DPoPGuard.name);

  constructor(private readonly dpopService: DPoPService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DPoPRequest>();

    // 1. Extract DPoP header
    const dpopHeader = request.headers['dpop'] as string;
    if (!dpopHeader) {
      this.logger.warn('Request rejected: Missing DPoP proof header');
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'invalid_dpop_proof',
        message: 'Missing DPoP proof header in request',
      });
    }

    // 2. Extract Access Token from Authorization header (if present)
    const authHeader = request.headers['authorization'];
    let accessToken: string | undefined;

    if (authHeader) {
      const match = authHeader.match(/^(?:DPoP|Bearer)\s+(.+)$/i);
      if (match) {
        accessToken = match[1].trim();
      }
    }

    // 3. Reconstruct full request URL without query string
    const protocol = request.protocol || 'http';
    const host = request.get('host') || 'localhost:3333';
    const pathOnly = (request.originalUrl || request.url || '').split('?')[0];
    const fullUrl = `${protocol}://${host}${pathOnly}`;

    // 4. Validate DPoP Proof
    const validationResult = await this.dpopService.validateDPoPProof(
      dpopHeader,
      request.method,
      fullUrl,
      accessToken,
    );

    if (!validationResult.isValid) {
      this.logger.warn(
        `DPoP validation failed [${validationResult.errorCode}]: ${validationResult.error}`,
      );
      throw new UnauthorizedException({
        statusCode: 401,
        error: validationResult.errorCode || 'invalid_dpop_proof',
        message: validationResult.error,
      });
    }

    // 5. Attach DPoP context to Request for downstream controllers/services
    request.dpop = {
      payload: validationResult.payload!,
      jwk: validationResult.header!.jwk,
    };

    return true;
  }
}
