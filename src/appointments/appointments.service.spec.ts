import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role, AppointmentStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/guards/user-auth.guard';

describe('AppointmentsService (TASK-301 & TASK-302)', () => {
  let service: AppointmentsService;
  let prisma: PrismaService;

  const patientA: AuthenticatedUser = {
    id: 'patient-A-uuid',
    email: 'patientA@careflow.vn',
    passwordHash: null,
    role: Role.PATIENT,
    fullName: 'Patient A',
    phone: '0901111111',
    tideId: 'tide-pA',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const patientB: AuthenticatedUser = {
    id: 'patient-B-uuid',
    email: 'patientB@careflow.vn',
    passwordHash: null,
    role: Role.PATIENT,
    fullName: 'Patient B',
    phone: '0902222222',
    tideId: 'tide-pB',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSlot = {
    id: 'slot-1',
    doctorId: 'doc-1',
    shiftId: 'shift-1',
    startTime: new Date('2026-10-23T08:00:00.000Z'),
    endTime: new Date('2026-10-23T08:30:00.000Z'),
    isBooked: false,
  };

  const mockService = {
    id: 'service-1',
    name: 'General Checkup',
    price: 200000,
    durationMinutes: 30,
    isActive: true,
  };

  const mockDoctor = {
    id: 'doc-1',
    userId: 'user-doc-1',
    clinicId: 'clinic-1',
    specialty: 'Cardiology',
    licenseNumber: 'LIC-001',
  };

  const mockAppointment = {
    id: 'app-1',
    idempotencyKey: 'idem-key-123',
    patientId: 'patient-A-uuid',
    doctorId: 'doc-1',
    serviceId: 'service-1',
    slotId: 'slot-1',
    status: AppointmentStatus.CONFIRMED,
    notes: 'Sample note',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTx = {
    slot: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    doctor: {
      findFirst: jest.fn(),
    },
    appointment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const mockPrisma = {
    appointment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    service: {
      findUnique: jest.fn(),
    },
    doctor: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    slot: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockTx)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('getAppointments (Privacy & Invariant: Patient A cannot view Patient B)', () => {
    it('should return appointments for the requesting patient', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([mockAppointment]);

      const result = await service.getAppointments(patientA, {});
      expect(result).toHaveLength(1);
      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: patientA.id },
        }),
      );
    });

    it('MUST throw 403 Forbidden when Patient A attempts to view Patient B appointments', async () => {
      await expect(
        service.getAppointments(patientA, { patientId: 'patient-B-uuid' }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.appointment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('createAppointment (TASK-301: Idempotency & Race Condition 409 Conflict)', () => {
    it('should return existing appointment if Idempotency-Key already exists', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue(mockAppointment);

      const result = await service.createAppointment(
        patientA,
        {
          doctorId: 'doc-1',
          serviceId: 'service-1',
          slotId: 'slot-1',
        },
        'idem-key-123',
      );

      expect(result.id).toBe(mockAppointment.id);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('MUST throw 409 Conflict if target slot is already booked (Anti-Race Condition)', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue(null); // No idempotent match
      mockPrisma.service.findUnique.mockResolvedValue(mockService);

      // Slot is already booked
      mockTx.slot.findUnique.mockResolvedValue({
        ...mockSlot,
        isBooked: true,
      });

      await expect(
        service.createAppointment(
          patientA,
          {
            doctorId: 'doc-1',
            serviceId: 'service-1',
            slotId: 'slot-1',
          },
          'new-key-456',
        ),
      ).rejects.toThrow(ConflictException);

      expect(mockTx.slot.update).not.toHaveBeenCalled();
      expect(mockTx.appointment.create).not.toHaveBeenCalled();
    });

    it('should create appointment and book slot in 1 atomic transaction when valid', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue(null);
      mockPrisma.service.findUnique.mockResolvedValue(mockService);

      mockTx.slot.findUnique.mockResolvedValue({
        ...mockSlot,
        isBooked: false,
      });
      mockTx.doctor.findFirst.mockResolvedValue(mockDoctor);
      mockTx.slot.update.mockResolvedValue({ ...mockSlot, isBooked: true });
      mockTx.appointment.create.mockResolvedValue(mockAppointment);
      mockTx.auditLog.create.mockResolvedValue({});

      const result = await service.createAppointment(patientA, {
        doctorId: 'doc-1',
        serviceId: 'service-1',
        slotId: 'slot-1',
      });

      expect(result).toBeDefined();
      expect(mockTx.slot.update).toHaveBeenCalledWith({
        where: { id: 'slot-1' },
        data: { isBooked: true },
      });
      expect(mockTx.appointment.create).toHaveBeenCalled();
      expect(mockTx.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('rescheduleAppointment (TASK-302: Single DB Transaction Atomicity)', () => {
    const existingAppointment = {
      id: 'app-1',
      patientId: 'patient-A-uuid',
      doctorId: 'doc-1',
      slotId: 'slot-old',
      status: AppointmentStatus.CONFIRMED,
      notes: 'Initial booking',
    };

    it('should reschedule appointment atomically in 1 transaction (free old slot + reserve new slot)', async () => {
      mockTx.appointment.findUnique.mockResolvedValue(existingAppointment);

      // New slot is available
      mockTx.slot.findUnique.mockResolvedValue({
        id: 'slot-new',
        doctorId: 'doc-1',
        isBooked: false,
      });
      mockTx.slot.update.mockResolvedValue({});
      mockTx.appointment.update.mockResolvedValue({
        ...existingAppointment,
        slotId: 'slot-new',
        status: AppointmentStatus.RESCHEDULED,
      });
      mockTx.auditLog.create.mockResolvedValue({});

      const result = await service.rescheduleAppointment('app-1', patientA, {
        newSlotId: 'slot-new',
        reason: 'Schedule conflict',
      });

      expect(result.status).toBe(AppointmentStatus.RESCHEDULED);
      expect(result.slotId).toBe('slot-new');

      // Verify old slot was freed
      expect(mockTx.slot.update).toHaveBeenCalledWith({
        where: { id: 'slot-old' },
        data: { isBooked: false },
      });

      // Verify new slot was reserved
      expect(mockTx.slot.update).toHaveBeenCalledWith({
        where: { id: 'slot-new' },
        data: { isBooked: true },
      });

      // Verify audit log recorded in same transaction
      expect(mockTx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'APPOINTMENT_RESCHEDULED',
          }),
        }),
      );
    });

    it('MUST throw 409 Conflict if target new slot is already booked', async () => {
      mockTx.appointment.findUnique.mockResolvedValue(existingAppointment);

      // Target slot is already booked
      mockTx.slot.findUnique.mockResolvedValue({
        id: 'slot-busy',
        doctorId: 'doc-1',
        isBooked: true,
      });

      await expect(
        service.rescheduleAppointment('app-1', patientA, {
          newSlotId: 'slot-busy',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockTx.slot.update).not.toHaveBeenCalled();
      expect(mockTx.appointment.update).not.toHaveBeenCalled();
    });

    it('MUST throw 403 Forbidden if Patient B tries to reschedule Patient A appointment', async () => {
      mockTx.appointment.findUnique.mockResolvedValue(existingAppointment);

      await expect(
        service.rescheduleAppointment('app-1', patientB, {
          newSlotId: 'slot-new',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockTx.slot.update).not.toHaveBeenCalled();
    });
  });

  describe('checkInAppointment (TASK-302)', () => {
    it('should check in patient and record audit log', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue(mockAppointment);
      mockPrisma.appointment.update.mockResolvedValue({
        ...mockAppointment,
        status: AppointmentStatus.CHECKED_IN,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.checkInAppointment('app-1', patientA);
      expect(result.status).toBe(AppointmentStatus.CHECKED_IN);
      expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'app-1' },
        data: { status: AppointmentStatus.CHECKED_IN },
        include: expect.any(Object),
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });
});
