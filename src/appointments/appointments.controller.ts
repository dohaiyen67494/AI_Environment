import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { UserAuthGuard, AuthenticatedUser } from '../auth/guards/user-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Appointments')
@ApiBearerAuth('JWT-auth')
@UseGuards(UserAuthGuard)
@Controller('v1/appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get appointments (Patients can only see their own; other patients blocked with 403)',
  })
  @ApiResponse({ status: 200, description: 'List of appointments' })
  @ApiResponse({ status: 403, description: 'Forbidden if patient views another patient’s appointments' })
  getAppointments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryAppointmentsDto,
  ) {
    return this.appointmentsService.getAppointments(user, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Book appointment (Supports Idempotency-Key & anti-race-condition with 409 Conflict)',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Unique client operation key preventing duplicate booking on network retries',
  })
  @ApiResponse({ status: 201, description: 'Appointment created successfully' })
  @ApiResponse({ status: 409, description: 'Conflict: Slot already booked concurrently' })
  createAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAppointmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.appointmentsService.createAppointment(user, dto, idempotencyKey);
  }

  @Post(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reschedule appointment atomically in 1 single Database Transaction',
  })
  @ApiResponse({ status: 200, description: 'Appointment rescheduled successfully' })
  @ApiResponse({ status: 409, description: 'Conflict: Target slot already booked' })
  @ApiResponse({ status: 403, description: 'Forbidden: Cannot reschedule another patient’s appointment' })
  rescheduleAppointment(
    @Param('id') appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.appointmentsService.rescheduleAppointment(appointmentId, user, dto);
  }

  @Post(':id/check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check in for appointment' })
  @ApiResponse({ status: 200, description: 'Checked in successfully' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  checkInAppointment(
    @Param('id') appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointmentsService.checkInAppointment(appointmentId, user);
  }
}
