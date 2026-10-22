import { HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

describe('PrismaExceptionFilter', () => {
  let filter: PrismaExceptionFilter;
  let mockResponse: Partial<Response>;
  let mockHost: ArgumentsHost;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    filter = new PrismaExceptionFilter();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockResponse = {
      status: statusMock,
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse as Response,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should transform P2002 (Unique constraint violation) into HTTP 409 Conflict', () => {
    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`doctorId`, `startTime`)',
      {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['doctorId', 'startTime'] },
      },
    );

    filter.catch(p2002Error, mockHost);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
      }),
    );
  });

  it('should transform P2025 (Record not found) into HTTP 404 Not Found', () => {
    const p2025Error = new Prisma.PrismaClientKnownRequestError(
      'Record to update not found',
      {
        code: 'P2025',
        clientVersion: '5.22.0',
      },
    );

    filter.catch(p2025Error, mockHost);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        code: 'RECORD_NOT_FOUND',
      }),
    );
  });

  it('should transform P2003 (Foreign key violation) into HTTP 400 Bad Request', () => {
    const p2003Error = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed on the field: `clinicId`',
      {
        code: 'P2003',
        clientVersion: '5.22.0',
      },
    );

    filter.catch(p2003Error, mockHost);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'FOREIGN_KEY_VIOLATION',
      }),
    );
  });
});
