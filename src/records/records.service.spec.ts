import { Test, TestingModule } from '@nestjs/testing';
import { RecordsService } from './records.service';
import { PrismaService } from '../prisma/prisma.service';
import { TideQeaService } from '../tide/tide-qea.service';
import { DPoPReplayCacheService } from '../auth/dpop/dpop-replay-cache.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role, PolicyStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/guards/user-auth.guard';
import { TideQeaAssertion, TideQeaAssertionPayload } from '../tide/tide-qea.types';
import { signPayloadWithAdminKey } from '../tide/tide-qea-keys.fixture';

describe('RecordsService (TASK-303: Ciphertext Storage & Tide QEA 2/3 Verification)', () => {
  let service: RecordsService;
  let prisma: PrismaService;
  let tideQeaService: TideQeaService;
  let replayCache: DPoPReplayCacheService;

  const doctorUser: AuthenticatedUser = {
    id: 'user-doctor-1',
    email: 'doctor.an@careflow.vn',
    passwordHash: null,
    role: Role.DOCTOR,
    fullName: 'BS. Nguyen Van An',
    phone: '0911000001',
    tideId: 'tide-doctor-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const adminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'admin1@careflow.vn',
    passwordHash: null,
    role: Role.ADMIN,
    fullName: 'Quản trị viên 1',
    phone: '0911000002',
    tideId: 'tide-admin-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const patientUser: AuthenticatedUser = {
    id: 'user-patient-1',
    email: 'patient@careflow.vn',
    passwordHash: null,
    role: Role.PATIENT,
    fullName: 'Le Van C',
    phone: '0911000003',
    tideId: 'tide-patient-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEncryptedRecord = {
    id: 'rec-uuid-1',
    appointmentId: 'app-uuid-1',
    patientId: 'user-patient-1',
    doctorId: 'doc-uuid-1',
    ciphertext: 'encrypted_clinical_data_base64_string_cannot_be_read_by_backend',
    iv: 'sample_iv_123',
    tag: 'sample_auth_tag_456',
    signedPolicyId: 'pol-qea-2of3-sample',
    createdAt: new Date(),
    updatedAt: new Date(),
    signedPolicy: {
      id: 'pol-qea-2of3-sample',
      policyDefinition: '{"resource":"MedicalRecord","action":"DECRYPT_RECORD"}',
      signedToken: 'sample_policy_token',
      thresholdRequired: 2,
      totalAdmins: 3,
      status: PolicyStatus.ACTIVE,
    },
    appointment: {
      id: 'app-uuid-1',
      status: 'COMPLETED',
      service: { name: 'Khám Tim Mạch' },
    },
  };

  const mockPrisma = {
    appointment: {
      findUnique: jest.fn(),
    },
    signedPolicy: {
      findUnique: jest.fn(),
    },
    encryptedRecord: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    replayCache = new DPoPReplayCacheService();
    tideQeaService = new TideQeaService(replayCache);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TideQeaService, useValue: tideQeaService },
      ],
    }).compile();

    service = module.get<RecordsService>(RecordsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    replayCache.onModuleDestroy();
  });

  describe('createEncryptedRecord (Security Invariant #2: Plaintext Strictly Forbidden)', () => {
    const validDto = {
      appointmentId: 'app-uuid-1',
      patientId: 'user-patient-1',
      doctorId: 'doc-uuid-1',
      ciphertext: 'valid_base64_ciphertext',
      iv: 'valid_iv',
      tag: 'valid_tag',
      signedPolicyId: 'pol-qea-2of3-sample',
    };

    it('should successfully store encrypted record when payload is strictly ciphertext', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'app-uuid-1',
        record: null,
      });
      mockPrisma.signedPolicy.findUnique.mockResolvedValue({
        id: 'pol-qea-2of3-sample',
      });
      mockPrisma.encryptedRecord.create.mockResolvedValue({
        id: 'rec-uuid-1',
        ...validDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createEncryptedRecord(
        doctorUser,
        validDto,
        validDto,
      );

      expect(result.id).toBe('rec-uuid-1');
      expect(result.ciphertext).toBe(validDto.ciphertext);
      expect(mockPrisma.encryptedRecord.create).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('MUST throw BadRequestException if client attempts to pass ANY plaintext medical fields', async () => {
      const forbiddenPayloads = [
        { ...validDto, diagnosis: 'Cao huyết áp độ 2' },
        { ...validDto, prescription: 'Amlodipine 5mg' },
        { ...validDto, notes: 'Bệnh nhân có tiền sử đau thắt ngực' },
        { ...validDto, clinicalNotes: 'Huyết áp 140/90' },
        { ...validDto, plaintext: 'Khám tim bình thường' },
      ];

      for (const forbiddenPayload of forbiddenPayloads) {
        await expect(
          service.createEncryptedRecord(doctorUser, validDto, forbiddenPayload),
        ).rejects.toThrow(BadRequestException);
      }

      expect(mockPrisma.encryptedRecord.create).not.toHaveBeenCalled();
    });
  });

  describe('getEncryptedRecord & Tide QEA 2/3 Verification (TASK-303)', () => {
    const buildAssertion = (adminIds: string[]): TideQeaAssertion => {
      const now = Math.floor(Date.now() / 1000);
      const payload: TideQeaAssertionPayload = {
        policyId: 'pol-qea-2of3-sample',
        resource: 'MedicalRecord',
        action: 'DECRYPT_RECORD',
        recordId: 'rec-uuid-1',
        requesterId: doctorUser.id,
        nonce: `nonce-${Date.now()}-${Math.random()}`,
        issuedAt: now,
        expiresAt: now + 3600,
      };

      const canonical = tideQeaService.serializePayloadCanonical(payload);
      const signatures = adminIds.map((adminId) => ({
        adminId,
        algorithm: 'ES256' as const,
        signature: signPayloadWithAdminKey(adminId, canonical),
        signedAt: now,
      }));

      return { payload, signatures };
    };

    it('should return Ciphertext and Signed Policy without grant token if no QEA assertion provided', async () => {
      mockPrisma.encryptedRecord.findUnique.mockResolvedValue(mockEncryptedRecord);

      const result = await service.getEncryptedRecord('rec-uuid-1', doctorUser);

      expect(result.record.ciphertext).toBe(mockEncryptedRecord.ciphertext);
      expect(result.signedPolicy).toBeDefined();
      expect(result.tideQeaStatus).toBe('PENDING_QUORUM');
      expect(result).not.toHaveProperty('decryptionGrantToken');
    });

    it('SUCCESS PROOF: Doctor providing 2/3 Admin QEA Assertion receives decryptionGrantToken', async () => {
      mockPrisma.encryptedRecord.findUnique.mockResolvedValue(mockEncryptedRecord);
      mockPrisma.auditLog.create.mockResolvedValue({});

      // Sign with 2 authorized admins: admin-001 and admin-002
      const assertion2of3 = buildAssertion(['tide-admin-001', 'tide-admin-002']);

      const result = await service.getEncryptedRecord(
        'rec-uuid-1',
        doctorUser,
        assertion2of3,
      );

      expect(result.tideQeaStatus).toBe('APPROVED');
      expect(result.verifiedSignaturesCount).toBe(2);
      expect(result.decryptionGrantToken).toBeDefined();
      expect(result.architectureNotice).toContain('Backend never decrypts plaintext');
    });

    it('SECURITY INVARIANT FAILURE PROOF: Doctor providing ONLY 1 Admin signature is REJECTED with 403 Forbidden', async () => {
      mockPrisma.encryptedRecord.findUnique.mockResolvedValue(mockEncryptedRecord);
      mockPrisma.auditLog.create.mockResolvedValue({});

      // Sign with only 1 admin: admin-001 (Threshold is 2)
      const assertion1of3 = buildAssertion(['tide-admin-001']);

      await expect(
        service.getEncryptedRecord('rec-uuid-1', doctorUser, assertion1of3),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DEFAULT DENY PROOF: Admin user attempting decryption is REJECTED with 403 Forbidden', async () => {
      mockPrisma.encryptedRecord.findUnique.mockResolvedValue(mockEncryptedRecord);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const assertion2of3 = buildAssertion(['tide-admin-001', 'tide-admin-002']);

      await expect(
        service.getEncryptedRecord('rec-uuid-1', adminUser, assertion2of3),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
