import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { AuthenticatedUser } from '../auth/guards/user-auth.guard';
import { Role, AppointmentStatus, Prisma } from '@prisma/client';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get appointments with strict RBAC access controls:
   * Patients can ONLY view their own appointments. Viewing another patient's appointments returns 403 Forbidden.
   */
  async getAppointments(user: AuthenticatedUser, query: QueryAppointmentsDto) {
    const where: Prisma.AppointmentWhereInput = {};

    // 1. Role-based scoping
    if (user.role === Role.PATIENT) {
      // Invariant: Bệnh nhân A có xem được lịch của bệnh nhân B không? (Phải bị chặn 403)
      if (query.patientId && query.patientId !== user.id) {
        this.logger.warn(
          `Security violation: Patient '${user.id}' attempted to access appointments of patient '${query.patientId}'`,
        );
        throw new ForbiddenException(
          'Access Denied: Patients are strictly forbidden from viewing appointments of other patients.',
        );
      }
      where.patientId = user.id;
    } else if (user.role === Role.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.id },
      });
      if (!doctor) {
        throw new NotFoundException('Doctor profile not found for current user');
      }
      where.doctorId = doctor.id;
      if (query.patientId) where.patientId = query.patientId;
    } else if (user.role === Role.ADMIN) {
      if (query.patientId) where.patientId = query.patientId;
      if (query.doctorId) where.doctorId = query.doctorId;
    }

    if (query.status) {
      where.status = query.status;
    }

    return this.prisma.appointment.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        doctor: {
          select: {
            id: true,
            specialty: true,
            licenseNumber: true,
            user: {
              select: {
                fullName: true,
                email: true,
              },
            },
            clinic: {
              select: {
                name: true,
                address: true,
              },
            },
          },
        },
        service: true,
        slot: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Create an Appointment with Idempotency Key support and Anti-Race Condition guarantees.
   * Race conditions on overlapping slots return HTTP 409 Conflict.
   */
  async createAppointment(
    user: AuthenticatedUser,
    dto: CreateAppointmentDto,
    idempotencyKey?: string,
  ) {
    // 1. Idempotency Key Handling
    if (idempotencyKey) {
      const existingByIdempotency = await this.prisma.appointment.findUnique({
        where: { idempotencyKey },
        include: {
          doctor: { select: { id: true, specialty: true } },
          service: true,
          slot: true,
        },
      });

      if (existingByIdempotency) {
        this.logger.log(
          `Idempotent request matched for key '${idempotencyKey}'. Returning cached appointment '${existingByIdempotency.id}'`,
        );
        return existingByIdempotency;
      }
    }

    // Determine target patient
    let effectivePatientId = user.id;
    if (user.role !== Role.PATIENT && dto.patientId) {
      effectivePatientId = dto.patientId;
    }

    // Verify Service exists
    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });
    if (!service) {
      throw new NotFoundException(`Service '${dto.serviceId}' not found.`);
    }

    // 2. Anti-Race Condition Database Transaction
    // Locks slot and creates appointment atomically
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Find and check Slot
        const slot = await tx.slot.findUnique({
          where: { id: dto.slotId },
        });

        if (!slot) {
          throw new NotFoundException(`Slot '${dto.slotId}' not found.`);
        }

        // Check if slot is already booked -> 409 Conflict
        if (slot.isBooked) {
          this.logger.warn(
            `Collision detected: Slot '${dto.slotId}' is already booked. Rejecting with 409 Conflict.`,
          );
          throw new ConflictException(
            'The requested slot is already booked. Please select an available slot.',
          );
        }

        // Verify slot belongs to the requested doctor (handle doctor.id or doctor.userId)
        const doctor = await tx.doctor.findFirst({
          where: {
            OR: [{ id: dto.doctorId }, { userId: dto.doctorId }],
          },
        });

        if (!doctor) {
          throw new NotFoundException(`Doctor '${dto.doctorId}' not found.`);
        }

        if (slot.doctorId !== doctor.id) {
          throw new BadRequestException('Slot does not belong to the selected doctor.');
        }

        // Mark Slot as Booked
        await tx.slot.update({
          where: { id: slot.id },
          data: { isBooked: true },
        });

        // Create Appointment (slotId has unique constraint as secondary guarantee)
        const appointment = await tx.appointment.create({
          data: {
            idempotencyKey: idempotencyKey || null,
            patientId: effectivePatientId,
            doctorId: doctor.id,
            serviceId: service.id,
            slotId: slot.id,
            status: AppointmentStatus.CONFIRMED,
            notes: dto.notes,
          },
          include: {
            doctor: {
              select: {
                id: true,
                specialty: true,
                user: { select: { fullName: true } },
              },
            },
            service: true,
            slot: true,
          },
        });

        // Record Audit Log
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'APPOINTMENT_CREATED',
            resource: 'Appointment',
            resourceId: appointment.id,
            details: {
              slotId: slot.id,
              doctorId: doctor.id,
              serviceId: service.id,
              idempotencyKey: idempotencyKey || null,
            },
          },
        });

        return appointment;
      });
    } catch (error) {
      // Prisma unique constraint violation (P2002) for slotId or idempotencyKey -> 409 Conflict
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'Slot collision detected: This slot was booked concurrently by another request.',
        );
      }
      throw error;
    }
  }

  /**
   * Reschedule Appointment in 1 Single Database Transaction (TASK-302)
   * Atomically: frees old slot, claims new slot, updates status, and logs audit trail.
   */
  async rescheduleAppointment(
    appointmentId: string,
    user: AuthenticatedUser,
    dto: RescheduleAppointmentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Find existing appointment
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId },
        include: { slot: true },
      });

      if (!appointment) {
        throw new NotFoundException(`Appointment '${appointmentId}' not found.`);
      }

      // Check ownership (Patients can only reschedule their own)
      if (user.role === Role.PATIENT && appointment.patientId !== user.id) {
        throw new ForbiddenException(
          'Access Denied: You cannot reschedule another patient’s appointment.',
        );
      }

      // Cannot reschedule finished/cancelled appointment
      if (
        appointment.status === AppointmentStatus.CANCELLED ||
        appointment.status === AppointmentStatus.COMPLETED
      ) {
        throw new BadRequestException(
          `Cannot reschedule an appointment that is already ${appointment.status.toLowerCase()}.`,
        );
      }

      // If same slot, return without change
      if (appointment.slotId === dto.newSlotId) {
        return appointment;
      }

      // 2. Validate new slot
      const newSlot = await tx.slot.findUnique({
        where: { id: dto.newSlotId },
      });

      if (!newSlot) {
        throw new NotFoundException(`Target slot '${dto.newSlotId}' not found.`);
      }

      // Race condition check on new slot -> 409 Conflict
      if (newSlot.isBooked) {
        this.logger.warn(
          `Reschedule Collision: Slot '${dto.newSlotId}' is already booked.`,
        );
        throw new ConflictException(
          'The target slot is already booked. Please choose a different slot.',
        );
      }

      if (newSlot.doctorId !== appointment.doctorId) {
        throw new BadRequestException(
          'Rescheduling must be booked with the same doctor.',
        );
      }

      // 3. Free old slot
      await tx.slot.update({
        where: { id: appointment.slotId },
        data: { isBooked: false },
      });

      // 4. Reserve new slot
      await tx.slot.update({
        where: { id: newSlot.id },
        data: { isBooked: true },
      });

      // 5. Update appointment
      const updatedNotes = dto.reason
        ? `${appointment.notes ? appointment.notes + ' | ' : ''}Rescheduled: ${dto.reason}`
        : appointment.notes;

      const updatedAppointment = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          slotId: newSlot.id,
          status: AppointmentStatus.RESCHEDULED,
          notes: updatedNotes,
        },
        include: {
          slot: true,
          doctor: {
            select: {
              id: true,
              specialty: true,
              user: { select: { fullName: true } },
            },
          },
          service: true,
        },
      });

      // 6. Write Audit Log within the same transaction
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'APPOINTMENT_RESCHEDULED',
          resource: 'Appointment',
          resourceId: appointmentId,
          details: {
            previousSlotId: appointment.slotId,
            newSlotId: newSlot.id,
            reason: dto.reason || null,
          },
        },
      });

      this.logger.log(
        `Appointment '${appointmentId}' rescheduled atomically from slot '${appointment.slotId}' to '${newSlot.id}'`,
      );

      return updatedAppointment;
    });
  }

  /**
   * Check in patient for appointment (TASK-302)
   */
  async checkInAppointment(appointmentId: string, user: AuthenticatedUser) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment '${appointmentId}' not found.`);
    }

    if (user.role === Role.PATIENT && appointment.patientId !== user.id) {
      throw new ForbiddenException(
        'Access Denied: You cannot check in for another patient’s appointment.',
      );
    }

    if (
      appointment.status === AppointmentStatus.CANCELLED ||
      appointment.status === AppointmentStatus.COMPLETED
    ) {
      throw new BadRequestException(
        `Cannot check in an appointment that is already ${appointment.status.toLowerCase()}.`,
      );
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.CHECKED_IN,
      },
      include: {
        slot: true,
        service: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'APPOINTMENT_CHECKED_IN',
        resource: 'Appointment',
        resourceId: appointmentId,
      },
    });

    return updated;
  }
}
