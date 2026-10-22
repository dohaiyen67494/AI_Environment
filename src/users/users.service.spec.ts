import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';

describe('UsersService (GET/PATCH /v1/me)', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-123',
    email: 'patient@example.com',
    fullName: 'Le Van C',
    phone: '0901234567',
    role: Role.PATIENT,
    tideId: 'tide-patient-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    doctorProfile: null,
  };

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    doctor: {
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should return user profile for valid userId', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile('user-123');
      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile (Role modification forbidden)', () => {
    it('should successfully update fullName and phone', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        fullName: 'Le Van C (Updated)',
        phone: '0988776655',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.updateProfile(
        'user-123',
        { fullName: 'Le Van C (Updated)', phone: '0988776655' },
        { fullName: 'Le Van C (Updated)', phone: '0988776655' },
      );

      expect(result.fullName).toBe('Le Van C (Updated)');
      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('MUST throw BadRequestException if user attempts to modify role', async () => {
      await expect(
        service.updateProfile(
          'user-123',
          { fullName: 'Attempting Role Change' },
          { fullName: 'Attempting Role Change', role: 'ADMIN' },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});
