import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { User, Role } from '@prisma/client';

export interface AuthenticatedUser extends User {
  doctorProfile?: {
    id: string;
    specialty: string;
    licenseNumber: string;
  } | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class UserAuthGuard implements CanActivate {
  private readonly logger = new Logger(UserAuthGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // 1. Check for x-user-id header (convenient for API testing, automation, and Tide integration)
    const xUserId = request.headers['x-user-id'] as string;
    const authHeader = request.headers['authorization'];

    let targetUserId: string | null = null;
    let targetEmail: string | null = null;

    if (xUserId) {
      targetUserId = xUserId;
    } else if (authHeader) {
      const tokenMatch = authHeader.match(/^(?:Bearer|DPoP)\s+(.+)$/i);
      if (tokenMatch) {
        const rawToken = tokenMatch[1].trim();
        // Try decoding JWT payload
        try {
          const parts = rawToken.split('.');
          if (parts.length >= 2) {
            const payload = JSON.parse(
              Buffer.from(parts[1], 'base64url').toString('utf8'),
            );
            targetUserId = payload.sub || payload.id || null;
            targetEmail = payload.email || null;
          }
        } catch {
          // Fall through
        }
      }
    }

    if (!targetUserId && !targetEmail) {
      this.logger.warn('UserAuthGuard: Missing authorization credentials');
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required. Please provide Authorization token or X-User-Id header.',
      });
    }

    // 2. Fetch User from Database
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          ...(targetUserId ? [{ id: targetUserId }, { tideId: targetUserId }] : []),
          ...(targetEmail ? [{ email: targetEmail }] : []),
        ],
      },
      include: {
        doctorProfile: {
          select: {
            id: true,
            specialty: true,
            licenseNumber: true,
          },
        },
      },
    });

    if (!user) {
      this.logger.warn(`UserAuthGuard: User not found for identifier '${targetUserId || targetEmail}'`);
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'User does not exist in the system.',
      });
    }

    // 3. Attach authenticated user to request
    request.user = user;
    return true;
  }
}
