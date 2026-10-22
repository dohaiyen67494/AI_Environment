import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth() {
    let dbStatus = 'disconnected';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'degraded';
    }

    return {
      status: 'ok',
      service: 'CareFlow Backend API',
      version: '1.0.0',
      database: dbStatus,
      port: 3333,
      timestamp: new Date().toISOString(),
    };
  }
}
