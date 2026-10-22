import {
  Controller,
  Get,
  Patch,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { UserAuthGuard, AuthenticatedRequest } from '../auth/guards/user-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('User Profile')
@ApiBearerAuth('JWT-auth')
@UseGuards(UserAuthGuard)
@Controller('v1/me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMe(@CurrentUser() user: User) {
    return this.usersService.getProfile(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update user profile (Cannot modify role)' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Attempted to modify role or invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  updateMe(
    @CurrentUser() user: User,
    @Body() updateDto: UpdateMeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.updateProfile(user.id, updateDto, req.body);
  }
}
