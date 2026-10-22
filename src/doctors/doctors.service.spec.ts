import { Test, TestingModule } from '@nestjs/testing';
import { DoctorsService } from './doctors.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('DoctorsService (GET /v1/doctors/:id/availability)', () => {
  let service: DoctorsService;
  let prisma: PrismaService;

  const mockDoctor = {
    id: 'doc-1',
    userId: 'user-doc-1',
    clinicId: 'clinic-1',
    specialty: 'Tim mạch',
    licenseNumber: 'CCHN-12345',
    user: {
      id: 'user-doc-1',
      fullName: 'BS. Nguyen Van A',
      email: 'doctor.an@careflow.vn',
      phone: '0911223344',
    },
    clinic: {
      id: 'clinic-1',
      name: 'CareFlow Central Clinic',
      address: '123 Nguyen Hue',
    },
  };

  const mockSlots = [
    {
      id: 'slot-1',
      doctorId: 'doc-1',
      shiftId: 'shift-1',
      startTime: new Date('2026-10-23T08:00:00.000Z'),
      endTime: new Date('2026-10-23T08:30:00.000Z'),
      isBooked: false,
      shift: { id: 'shift-1', date: new Date('2026-10-23') },
    },
    {
      id: 'slot-2',
      doctorId: 'doc-1',
      shiftId: 'shift-1',
      startTime: new Date('2026-10-23T08:30:00.000Z'),
      endTime: new Date('2026-10-23T09:00:00.000Z'),
      isBooked: false,
      shift: { id: 'shift-1', date: new Date('2026-10-23') },
    },
  ];

  const mockPrisma = {
    doctor: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    slot: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DoctorsService>(DoctorsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should return available unbooked slots for a doctor', async () => {
    mockPrisma.doctor.findFirst.mockResolvedValue(mockDoctor);
    mockPrisma.slot.findMany.mockResolvedValue(mockSlots);

    const result = await service.getDoctorAvailability('doc-1');

    expect(result.doctor.id).toBe('doc-1');
    expect(result.availableSlotsCount).toBe(2);
    expect(result.availableSlots).toEqual(mockSlots);
    expect(mockPrisma.slot.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ doctorId: 'doc-1', isBooked: false }),
      orderBy: { startTime: 'asc' },
      select: expect.any(Object),
    });
  });

  it('should throw NotFoundException if doctor does not exist', async () => {
    mockPrisma.doctor.findFirst.mockResolvedValue(null);

    await expect(service.getDoctorAvailability('unknown-doc')).rejects.toThrow(
      NotFoundException,
    );
  });
});
