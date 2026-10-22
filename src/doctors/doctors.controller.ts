import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { DoctorsService } from './doctors.service';

@ApiTags('Doctors & Availability')
@Controller('v1/doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  @ApiOperation({ summary: 'Get list of doctors' })
  @ApiResponse({ status: 200, description: 'List of doctors retrieved successfully' })
  getDoctors() {
    return this.doctorsService.getAllDoctors();
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Get doctor availability (unbooked slots)' })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Filter slots by date (YYYY-MM-DD)',
    example: '2026-10-23',
  })
  @ApiResponse({ status: 200, description: 'Available slots retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  getAvailability(
    @Param('id') doctorId: string,
    @Query('date') date?: string,
  ) {
    return this.doctorsService.getDoctorAvailability(doctorId, date);
  }
}
