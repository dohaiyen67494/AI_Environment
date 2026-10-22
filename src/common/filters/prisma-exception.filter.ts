import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    this.logger.warn(`Prisma Known Error [${exception.code}]: ${exception.message}`);

    // P2002: Unique constraint failed
    if (exception.code === 'P2002') {
      const target = (exception.meta?.target as string[]) || [];
      const fieldMsg = target.length > 0 ? ` on field(s): ${target.join(', ')}` : '';

      return response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: `Resource already exists or slot is already booked${fieldMsg}.`,
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
        timestamp: new Date().toISOString(),
      });
    }

    // P2025: Record to update/delete not found
    if (exception.code === 'P2025') {
      return response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: 'The requested record does not exist or has already been removed.',
        code: 'RECORD_NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
    }

    // P2003: Foreign key constraint failed
    if (exception.code === 'P2003') {
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Foreign key constraint failed. Related record not found.',
        code: 'FOREIGN_KEY_VIOLATION',
        timestamp: new Date().toISOString(),
      });
    }

    // Default DB error handling
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'A database error occurred while processing your request.',
      code: exception.code,
      timestamp: new Date().toISOString(),
    });
  }
}
