import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RescheduleAppointmentDto {
  @ApiProperty({
    description: 'Target new Slot ID to move appointment to',
    example: 'slot-new-uuid-5678',
  })
  @IsNotEmpty()
  @IsString()
  newSlotId: string;

  @ApiPropertyOptional({
    description: 'Reason for rescheduling',
    example: 'Bận đột xuất vào buổi sáng, xin chuyển sang ca chiều',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
