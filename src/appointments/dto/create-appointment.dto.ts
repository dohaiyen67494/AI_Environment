import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({
    description: 'Doctor ID or Doctor User ID',
    example: 'doc11111-1111-1111-1111-111111111111',
  })
  @IsNotEmpty()
  @IsString()
  doctorId: string;

  @ApiProperty({
    description: 'Medical Service ID',
    example: 's1111111-1111-1111-1111-111111111111',
  })
  @IsNotEmpty()
  @IsString()
  serviceId: string;

  @ApiProperty({
    description: 'Target Slot ID',
    example: 'slot-uuid-1234',
  })
  @IsNotEmpty()
  @IsString()
  slotId: string;

  @ApiPropertyOptional({
    description: 'Patient ID (Only applicable if Admin is booking; Patients are auto-assigned to themselves)',
    example: 'p1111111-1111-1111-1111-111111111111',
  })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({
    description: 'Additional notes or symptoms',
    example: 'Khám định kỳ huyết áp và tim mạch',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
