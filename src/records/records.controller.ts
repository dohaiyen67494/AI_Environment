import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { RecordsService } from './records.service';
import { CreateEncryptedRecordDto } from './dto/create-record.dto';
import { UserAuthGuard, AuthenticatedUser, AuthenticatedRequest } from '../auth/guards/user-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Encrypted Medical Records')
@ApiBearerAuth('JWT-auth')
@UseGuards(UserAuthGuard)
@Controller('v1/records')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Post()
  @ApiOperation({
    summary: 'Store Encrypted Medical Record (NO PLAINTEXT ALLOWED)',
    description:
      'Backend only stores ciphertext, iv, tag, and signedPolicyId. Plaintext clinical fields will be rejected with 400 Bad Request.',
  })
  @ApiResponse({ status: 201, description: 'Encrypted record saved successfully' })
  @ApiResponse({ status: 400, description: 'Attempted to send plaintext or invalid input' })
  createRecord(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEncryptedRecordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.recordsService.createEncryptedRecord(user, dto, req.body);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Encrypted Record & Tide QEA Decryption Grant Token',
    description:
      'Returns ciphertext and signed policy. If x-tide-qea-assertion header is supplied with >= 2/3 Admin signatures, returns decryption grant token. Backend NEVER decrypts plaintext.',
  })
  @ApiHeader({
    name: 'x-tide-qea-assertion',
    required: false,
    description: 'Tide Multi-Admin QEA Signed Assertion (JSON or Base64URL string)',
  })
  @ApiResponse({ status: 200, description: 'Ciphertext and signed policy retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden if Tide QEA threshold (< 2 admins) is not met' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  getRecord(
    @Param('id') recordId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-tide-qea-assertion') headerAssertion?: string,
    @Query('qeaAssertion') queryAssertion?: string,
  ) {
    const qeaInput = headerAssertion || queryAssertion;
    return this.recordsService.getEncryptedRecord(recordId, user, qeaInput);
  }
}
