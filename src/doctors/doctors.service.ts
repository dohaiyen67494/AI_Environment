import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDoctorAvailability(doctorIdOrUserId: string, dateStr?: string) {
    // 1. Find Doctor by doctor.id or doctor.userId
    const doctor = await this.prisma.doctor.findFirst({
      where: {
        OR: [{ id: doctorIdOrUserId }, { userId: doctorIdOrUserId }],
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        clinic: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID '${doctorIdOrUserId}' not found.`);
    }

    // 2. Build date filters if provided
    let dateFilter: { gte?: Date; lte?: Date } | undefined;
    if (dateStr) {
      const startOfDay = new Date(dateStr);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(dateStr);
      endOfDay.setUTCHours(23, 59, 59, 999);
      dateFilter = { gte: startOfDay, lte: endOfDay };
    }

    // 3. Find unbooked slots
    const slots = await this.prisma.slot.findMany({
      where: {
        doctorId: doctor.id,
        isBooked: false,
        ...(dateFilter ? { startTime: dateFilter } : {}),
      },
      orderBy: {
        startTime: 'asc',
      },
      select: {
        id: true,
        doctorId: true,
        shiftId: true,
        startTime: true,
        endTime: true,
        isBooked: true,
        shift: {
          select: {
            id: true,
            date: true,
          },
        },
      },
    });

    return {
      doctor: {
        id: doctor.id,
        userId: doctor.userId,
        fullName: doctor.user.fullName,
        specialty: doctor.specialty,
        licenseNumber: doctor.licenseNumber,
        clinic: doctor.clinic,
      },
      availableSlotsCount: slots.length,
      availableSlots: slots,
    };
  }

  async getAllDoctors() {
    return this.prisma.doctor.findMany({
      include: {
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
    });
  }
}
