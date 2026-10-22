import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TideQeaService } from '../tide/tide-qea.service';
import { CreateEncryptedRecordDto } from './dto/create-record.dto';
import { AuthenticatedUser } from '../auth/guards/user-auth.guard';
import { TideQeaAssertion } from '../tide/tide-qea.types';
import { Role } from '@prisma/client';

@Injectable()
export class RecordsService {
  private readonly logger = new Logger(RecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tideQeaService: TideQeaService,
  ) {}

  /**
   * Store Encrypted Medical Record (TASK-303)
   * INVARIANT: Only stores ciphertext, iv, tag, signedPolicyId.
   * ABSOLUTELY NO PLAINTEXT ALLOWED.
   */
  async createEncryptedRecord(
    user: AuthenticatedUser,
    dto: CreateEncryptedRecordDto,
    rawBody?: Record<string, unknown>,
  ) {
    // 1. Strict defense: Reject any plaintext clinical fields in payload
    const forbiddenPlaintextKeys = [
      'diagnosis',
      'prescription',
      'notes',
      'clinicalNotes',
      'medicalNotes',
      'plaintext',
      'plainText',
      'content',
      'unencrypted',
    ];

    if (rawBody) {
      for (const key of forbiddenPlaintextKeys) {
        if (key in rawBody) {
          this.logger.error(
            `Security Invariant Violation: Client submitted plaintext field '${key}' to /v1/records!`,
          );
          throw new BadRequestException(
            `Security Invariant Violation: Plaintext clinical field '${key}' is strictly forbidden. Backend only stores ciphertext, iv, tag, and signedPolicyId.`,
          );
        }
      }
    }

    // 2. Validate appointment exists
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: { record: true },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment '${dto.appointmentId}' not found.`);
    }

    if (appointment.record) {
      throw new BadRequestException(
        `Appointment '${dto.appointmentId}' already has an encrypted record associated.`,
      );
    }

    // 3. Validate SignedPolicy exists
    const policy = await this.prisma.signedPolicy.findUnique({
      where: { id: dto.signedPolicyId },
    });

    if (!policy) {
      throw new NotFoundException(
        `SignedPolicy '${dto.signedPolicyId}' not found. Please provide a valid Tide QEA policy.`,
      );
    }

    // 4. Save Encrypted Record
    const record = await this.prisma.encryptedRecord.create({
      data: {
        appointmentId: dto.appointmentId,
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        ciphertext: dto.ciphertext,
        iv: dto.iv,
        tag: dto.tag,
        signedPolicyId: dto.signedPolicyId,
      },
      select: {
        id: true,
        appointmentId: true,
        patientId: true,
        doctorId: true,
        ciphertext: true,
        iv: true,
        tag: true,
        signedPolicyId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 5. Audit Log
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'ENCRYPTED_RECORD_STORED',
        resource: 'EncryptedRecord',
        resourceId: record.id,
        details: {
          appointmentId: dto.appointmentId,
          signedPolicyId: dto.signedPolicyId,
        },
      },
    });

    this.logger.log(`EncryptedRecord '${record.id}' stored successfully.`);
    return record;
  }

  /**
   * Retrieve Encrypted Record & Evaluate Tide QEA Multi-Admin Quorum (TASK-303)
   * INVARIANT CONSTRAINTS:
   * 1. Backend ONLY returns Ciphertext and Signed Policy.
   * 2. Backend NEVER decrypts plaintext.
   * 3. Doctor with 2/3 Admin QEA assertion receives decryptionGrantToken for client-side KMS decryption.
   * 4. Doctor with < 2 Admin QEA assertion is REJECTED with 403 Forbidden.
   */
  async getEncryptedRecord(
    recordId: string,
    user: AuthenticatedUser,
    qeaAssertionInput?: string | TideQeaAssertion,
  ) {
    // 1. Fetch record
    const record = await this.prisma.encryptedRecord.findUnique({
      where: { id: recordId },
      include: {
        signedPolicy: true,
        appointment: {
          select: {
            id: true,
            status: true,
            service: { select: { name: true } },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException(`Medical record '${recordId}' not found.`);
    }

    // 2. Access control on viewing metadata
    if (user.role === Role.PATIENT && record.patientId !== user.id) {
      throw new ForbiddenException(
        'Access Denied: You cannot view medical records belonging to other patients.',
      );
    }

    // 3. Process QEA Assertion if provided
    let parsedAssertion: TideQeaAssertion | undefined;
    if (qeaAssertionInput) {
      if (typeof qeaAssertionInput === 'string') {
        try {
          // Can be JSON or Base64URL
          const jsonStr = qeaAssertionInput.trim().startsWith('{')
            ? qeaAssertionInput
            : Buffer.from(qeaAssertionInput, 'base64url').toString('utf8');
          parsedAssertion = JSON.parse(jsonStr);
        } catch {
          throw new BadRequestException('Invalid format for Tide QEA Assertion.');
        }
      } else {
        parsedAssertion = qeaAssertionInput;
      }
    }

    // 4. If user requested decryption grant (or provided QEA assertion)
    if (parsedAssertion) {
      const qeaResponse = this.tideQeaService.requestRecordAccess({
        requesterId: user.id,
        requesterRole: user.role,
        recordId: record.id,
        qeaAssertion: parsedAssertion,
      });

      // Audit Log the access attempt
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: qeaResponse.allowed
            ? 'QEA_DECRYPTION_GRANT_ISSUED'
            : 'QEA_DECRYPTION_GRANT_DENIED',
          resource: 'EncryptedRecord',
          resourceId: record.id,
          details: {
            allowed: qeaResponse.allowed,
            qeaStatus: qeaResponse.qeaStatus,
            verifiedSignaturesCount: qeaResponse.verifiedSignaturesCount,
          },
        },
      });

      // If Quorum threshold was NOT satisfied (e.g. only 1 admin signed) -> 403 Forbidden
      if (!qeaResponse.allowed) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          message: qeaResponse.message,
          qeaStatus: qeaResponse.qeaStatus,
          verifiedSignaturesCount: qeaResponse.verifiedSignaturesCount,
        });
      }

      // Quorum satisfied (>= 2 of 3 admins signed):
      // Return ciphertext + signed policy + client-side decryption grant token
      return {
        record: {
          id: record.id,
          appointmentId: record.appointmentId,
          patientId: record.patientId,
          doctorId: record.doctorId,
          ciphertext: record.ciphertext,
          iv: record.iv,
          tag: record.tag,
          signedPolicyId: record.signedPolicyId,
          createdAt: record.createdAt,
        },
        signedPolicy: record.signedPolicy,
        tideQeaStatus: 'APPROVED',
        verifiedSignaturesCount: qeaResponse.verifiedSignaturesCount,
        decryptionGrantToken: qeaResponse.decryptionGrantToken,
        architectureNotice:
          'Backend never decrypts plaintext. Client must present decryptionGrantToken to Tide KMS to decrypt ciphertext locally.',
      };
    }

    // 5. Default view (returns Ciphertext and Signed Policy without decryption grant)
    return {
      record: {
        id: record.id,
        appointmentId: record.appointmentId,
        patientId: record.patientId,
        doctorId: record.doctorId,
        ciphertext: record.ciphertext,
        iv: record.iv,
        tag: record.tag,
        signedPolicyId: record.signedPolicyId,
        createdAt: record.createdAt,
      },
      signedPolicy: record.signedPolicy,
      tideQeaStatus: 'PENDING_QUORUM',
      notice:
        'To obtain a client-side decryption grant token, submit a valid Tide QEA assertion with at least 2/3 Admin signatures.',
    };
  }
}
