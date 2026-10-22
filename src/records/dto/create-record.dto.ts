import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEncryptedRecordDto {
  @ApiProperty({
    description: 'Appointment ID associated with this medical record',
    example: 'app-uuid-1111',
  })
  @IsNotEmpty()
  @IsString()
  appointmentId: string;

  @ApiProperty({
    description: 'Patient ID',
    example: 'p1111111-1111-1111-1111-111111111111',
  })
  @IsNotEmpty()
  @IsString()
  patientId: string;

  @ApiProperty({
    description: 'Doctor ID',
    example: 'doc11111-1111-1111-1111-111111111111',
  })
  @IsNotEmpty()
  @IsString()
  doctorId: string;

  @ApiProperty({
    description: 'AES-256-GCM / Tide encrypted ciphertext (Base64 string). NO PLAINTEXT ALLOWED.',
    example: 'oJd8s7dfY8sd7Fsd8F7sdg6sd8F6s8df76sdF8sd7f8s6dF8s6d...',
  })
  @IsNotEmpty()
  @IsString()
  ciphertext: string;

  @ApiProperty({
    description: 'Cryptographic Initialization Vector (IV, Base64/Hex)',
    example: 'd9s8f7sd8f7s6d5f4s3a==',
  })
  @IsNotEmpty()
  @IsString()
  iv: string;

  @ApiProperty({
    description: 'Authentication Tag (GCM Auth Tag, Base64/Hex)',
    example: 'a1b2c3d4e5f67890==',
  })
  @IsNotEmpty()
  @IsString()
  tag: string;

  @ApiProperty({
    description: 'Tide Multi-Admin QEA Signed Policy ID',
    example: 'pol-qea-2of3-sample',
  })
  @IsNotEmpty()
  @IsString()
  signedPolicyId: string;
}
