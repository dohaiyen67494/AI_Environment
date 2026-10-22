import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '@prisma/client';

export class QueryAppointmentsDto {
  @ApiPropertyOptional({
    description: 'Filter by Patient ID (Restricted: Patients can only view their own)',
    example: 'p1111111-1111-1111-1111-111111111111',
  })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({
    description: 'Filter by Doctor ID',
    example: 'doc11111-1111-1111-1111-111111111111',
  })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiPropertyOptional({
    description: 'Filter by Appointment Status',
    enum: AppointmentStatus,
  })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}
