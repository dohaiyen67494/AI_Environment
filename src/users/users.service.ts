import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMeDto } from './dto/update-me.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        tideId: true,
        createdAt: true,
        updatedAt: true,
        doctorProfile: {
          select: {
            id: true,
            specialty: true,
            licenseNumber: true,
            bio: true,
            clinic: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return user;
  }

  async updateProfile(userId: string, updateDto: UpdateMeDto, rawPayload?: Record<string, unknown>) {
    // Invariant requirement: Do not allow modifying role
    if (rawPayload && 'role' in rawPayload) {
      this.logger.warn(`User ${userId} attempted unauthorized role modification`);
      throw new BadRequestException(
        'Modifying user role via profile update is strictly forbidden.',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { doctorProfile: true },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const { fullName, phone, bio } = updateDto;

    // Update User core fields
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(fullName ? { fullName } : {}),
        ...(phone !== undefined ? { phone } : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        tideId: true,
        updatedAt: true,
        doctorProfile: {
          select: {
            id: true,
            specialty: true,
            licenseNumber: true,
            bio: true,
          },
        },
      },
    });

    // If bio was passed and user is a doctor, update doctor profile
    if (bio && existingUser.doctorProfile) {
      await this.prisma.doctor.update({
        where: { id: existingUser.doctorProfile.id },
        data: { bio },
      });
      if (updatedUser.doctorProfile) {
        updatedUser.doctorProfile.bio = bio;
      }
    }

    // Ghi log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'USER_PROFILE_UPDATED',
        resource: 'User',
        resourceId: userId,
        details: { updatedFields: Object.keys(updateDto) },
      },
    });

    return updatedUser;
  }
}
