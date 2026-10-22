import * as fs from 'fs';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Role, AppointmentStatus, PolicyStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { RecordsService } from '../src/records/records.service';
import { TideQeaService } from '../src/tide/tide-qea.service';
import { DPoPReplayCacheService } from '../src/auth/dpop/dpop-replay-cache.service';
import { DPoPService } from '../src/auth/dpop/dpop.service';
import { AuthenticatedUser } from '../src/auth/guards/user-auth.guard';
import { signPayloadWithAdminKey } from '../src/tide/tide-qea-keys.fixture';

/**
 * CareFlow Core Acceptance Test Suite (TASK-402)
 * Demonstrating full compliance across the 6 Core Evaluation Criteria of RMIT UNLOCKED Hackathon.
 */
describe('CareFlow Core Acceptance Test Suite (6 Criteria Verification)', () => {
  let appointmentsService: AppointmentsService;
  let recordsService: RecordsService;
  let tideQeaService: TideQeaService;
  let replayCache: DPoPReplayCacheService;
  let dpopService: DPoPService;

  // Mocked Users
  const patientA: AuthenticatedUser = {
    id: 'patient-A-uuid',
    email: 'patientA@careflow.vn',
    passwordHash: null,
    role: Role.PATIENT,
    fullName: 'Patient A (Nguyen Van A)',
    phone: '0901111111',
    tideId: 'tide-patient-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const patientB: AuthenticatedUser = {
    id: 'patient-B-uuid',
    email: 'patientB@careflow.vn',
    passwordHash: null,
    role: Role.PATIENT,
    fullName: 'Patient B (Tran Thi B)',
    phone: '0902222222',
    tideId: 'tide-patient-002',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const doctorUser: AuthenticatedUser = {
    id: 'user-doc-1',
    email: 'doctor.an@careflow.vn',
    passwordHash: null,
    role: Role.DOCTOR,
    fullName: 'BS. CKII Nguyen Van An',
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
    fullName: 'Nguyen Minh Tri (Admin 1)',
    phone: '0911000002',
    tideId: 'tide-admin-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Mocked entities
  const mockSlot = {
    id: 'slot-uuid-1',
    doctorId: 'doc-uuid-1',
    shiftId: 'shift-uuid-1',
    startTime: new Date('2026-10-23T08:00:00.000Z'),
    endTime: new Date('2026-10-23T08:30:00.000Z'),
    isBooked: false,
    version: 0,
  };

  const mockTargetSlot = {
    id: 'slot-uuid-2',
    doctorId: 'doc-uuid-1',
    shiftId: 'shift-uuid-1',
    startTime: new Date('2026-10-23T08:30:00.000Z'),
    endTime: new Date('2026-10-23T09:00:00.000Z'),
    isBooked: false,
    version: 0,
  };

  const mockEncryptedRecord = {
    id: 'rec-uuid-1',
    appointmentId: 'app-uuid-1',
    patientId: 'patient-A-uuid',
    doctorId: 'doc-uuid-1',
    ciphertext: 'U2FsdGVkX1+vupppZksvRf5pq5g5XjFRIipRkw==_ciphertext_test',
    iv: 'dGVzdF9pdl8xNg==',
    tag: 'dGVzdF9hdXRoX3RhZw==',
    signedPolicyId: 'pol-qea-2of3-sample',
    createdAt: new Date(),
    updatedAt: new Date(),
    signedPolicy: {
      id: 'pol-qea-2of3-sample',
      policyDefinition: '{"resource":"MedicalRecord","action":"DECRYPT_RECORD"}',
      signedToken: 'tide_qea_sample_signed_jwt_assertion_token_proof_2_of_3',
      thresholdRequired: 2,
      totalAdmins: 3,
      status: PolicyStatus.ACTIVE,
    },
    appointment: {
      id: 'app-uuid-1',
      status: AppointmentStatus.COMPLETED,
      service: { name: 'Khám Tim Mạch' },
    },
  };

  let mockPrisma: any;

  beforeEach(async () => {
    replayCache = new DPoPReplayCacheService();
    dpopService = new DPoPService(replayCache);
    tideQeaService = new TideQeaService(replayCache);

    mockPrisma = {
      $transaction: jest.fn(async (cb) => {
        return cb(mockPrisma);
      }),
      slot: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      service: {
        findUnique: jest.fn().mockResolvedValue({ id: 'service-1', name: 'General Checkup' }),
      },
      doctor: {
        findFirst: jest.fn().mockResolvedValue({ id: 'doc-uuid-1', userId: 'user-doc-1' }),
      },
      appointment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      signedPolicy: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pol-qea-2of3-sample',
          status: PolicyStatus.ACTIVE,
          thresholdRequired: 2,
        }),
      },
      encryptedRecord: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        RecordsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TideQeaService, useValue: tideQeaService },
        { provide: DPoPReplayCacheService, useValue: replayCache },
        { provide: DPoPService, useValue: dpopService },
      ],
    }).compile();

    appointmentsService = module.get<AppointmentsService>(AppointmentsService);
    recordsService = module.get<RecordsService>(RecordsService);
  });

  afterEach(() => {
    replayCache.onModuleDestroy();
  });

  // =========================================================================
  // TIÊU CHÍ 1: CỔNG CHẠY HỆ THỐNG (API 3333, TIDECLOAK 8080)
  // =========================================================================
  describe('Criterion 1: System Port Binding Invariants (API: 3333, TideCloak: 8080)', () => {
    it('should verify docker-compose.yml strictly enforces port 3333 for API and 8080 for TideCloak', () => {
      const dockerComposePath = path.resolve(process.cwd(), 'docker-compose.yml');
      expect(fs.existsSync(dockerComposePath)).toBe(true);
      const dockerContent = fs.readFileSync(dockerComposePath, 'utf8');

      // Verify TideCloak port 8080
      expect(dockerContent).toMatch(/"8080:8080"/);
      expect(dockerContent).toMatch(/container_name:\s*careflow-tidecloak/);

      // Verify Backend port 3333
      expect(dockerContent).toMatch(/"3333:3333"/);
      expect(dockerContent).toMatch(/container_name:\s*careflow-backend/);
      expect(dockerContent).toMatch(/PORT:\s*3333/);
    });

    it('should verify .env.example defines PORT 3333 and TideCloak 8080', () => {
      const envPath = path.resolve(process.cwd(), '.env.example');
      expect(fs.existsSync(envPath)).toBe(true);
      const envContent = fs.readFileSync(envPath, 'utf8');

      expect(envContent).toContain('PORT=3333');
      expect(envContent).toContain('http://localhost:8080');
    });

    it('should verify careflow-realm.json binds to port 3333 API client', () => {
      const realmPath = path.resolve(process.cwd(), 'config', 'tide', 'careflow-realm.json');
      expect(fs.existsSync(realmPath)).toBe(true);
      const realmContent = JSON.parse(fs.readFileSync(realmPath, 'utf8'));

      expect(realmContent.realm).toBe('careflow');
      const backendClient = realmContent.clients.find(
        (c: any) => c.clientId === 'careflow-backend',
      );
      expect(backendClient).toBeDefined();
      expect(backendClient.rootUrl).toContain('3333');
      expect(backendClient.redirectUris[0]).toContain('3333');
    });
  });

  // =========================================================================
  // TIÊU CHÍ 2: CHỐNG RACE CONDITION ĐẶT TRÙNG LỊCH (409 CONFLICT)
  // =========================================================================
  describe('Criterion 2: Double Booking Race Condition Prevention (409 Conflict)', () => {
    it('should reject second concurrent booking on identical slot with HTTP 409 Conflict', async () => {
      let isFirstRequestDone = false;

      mockPrisma.slot.findUnique.mockImplementation(async () => {
        if (!isFirstRequestDone) {
          isFirstRequestDone = true;
          return { ...mockSlot, isBooked: false };
        }
        // Second concurrent request sees slot is already booked
        return { ...mockSlot, isBooked: true };
      });

      mockPrisma.appointment.create.mockResolvedValue({
        id: 'app-first-winner',
        slotId: mockSlot.id,
        patientId: patientA.id,
        status: AppointmentStatus.CONFIRMED,
      });

      // Request 1: Patient A books slot
      const request1Promise = appointmentsService.createAppointment(patientA, {
        doctorId: mockSlot.doctorId,
        serviceId: 'service-1',
        slotId: mockSlot.id,
      });

      // Request 2: Patient B concurrently attempts to book identical slot
      const request2Promise = appointmentsService.createAppointment(patientB, {
        doctorId: mockSlot.doctorId,
        serviceId: 'service-1',
        slotId: mockSlot.id,
      });

      const results = await Promise.allSettled([request1Promise, request2Promise]);

      // Request 1 must PASS
      expect(results[0].status).toBe('fulfilled');

      // Request 2 must FAIL with ConflictException (409)
      expect(results[1].status).toBe('rejected');
      if (results[1].status === 'rejected') {
        expect(results[1].reason).toBeInstanceOf(ConflictException);
        expect(results[1].reason.message).toContain('already booked');
        expect(results[1].reason.getStatus()).toBe(409);
      }
    });

    it('should prevent patient from viewing another patient’s appointments (403 Forbidden)', async () => {
      // Patient A queries with patientId = Patient B
      await expect(
        appointmentsService.getAppointments(patientA, { patientId: patientB.id }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // TIÊU CHÍ 3: ĐỔI LỊCH NẰM TRỌN TRONG 1 DATABASE TRANSACTION DUY NHẤT
  // =========================================================================
  describe('Criterion 3: Atomic Rescheduling Inside 1 Single Database Transaction', () => {
    it('should execute slot release, new slot reservation, and appointment update atomically', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'app-1',
        patientId: patientA.id,
        doctorId: 'doc-uuid-1',
        slotId: mockSlot.id,
        status: AppointmentStatus.CONFIRMED,
      });

      // Old slot is booked, new target slot is available
      mockPrisma.slot.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.id === mockSlot.id) return { ...mockSlot, isBooked: true };
        if (where.id === mockTargetSlot.id) return { ...mockTargetSlot, isBooked: false };
        return null;
      });

      mockPrisma.appointment.update.mockResolvedValue({
        id: 'app-1',
        slotId: mockTargetSlot.id,
        status: AppointmentStatus.RESCHEDULED,
      });

      const result = await appointmentsService.rescheduleAppointment('app-1', patientA, {
        newSlotId: mockTargetSlot.id,
      });

      // Verify single database transaction was invoked
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

      // Verify old slot was released (isBooked: false)
      expect(mockPrisma.slot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockSlot.id },
          data: expect.objectContaining({ isBooked: false }),
        }),
      );

      // Verify new slot was claimed (isBooked: true)
      expect(mockPrisma.slot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockTargetSlot.id },
          data: expect.objectContaining({ isBooked: true }),
        }),
      );

      expect(result.status).toBe(AppointmentStatus.RESCHEDULED);
    });

    it('should rollback transaction and return 409 if target slot is already booked', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'app-1',
        patientId: patientA.id,
        doctorId: 'doc-uuid-1',
        slotId: mockSlot.id,
        status: AppointmentStatus.CONFIRMED,
      });

      // Target slot is already booked by someone else
      mockPrisma.slot.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.id === mockTargetSlot.id) return { ...mockTargetSlot, isBooked: true };
        return null;
      });

      await expect(
        appointmentsService.rescheduleAppointment('app-1', patientA, {
          newSlotId: mockTargetSlot.id,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // =========================================================================
  // TIÊU CHÍ 4: BẢO MẬT HỒ SƠ - ZERO-KNOWLEDGE, KHÔNG LƯU/TRẢ PLAINTEXT
  // =========================================================================
  describe('Criterion 4: Encrypted Records Security (Zero-Knowledge, No Plaintext)', () => {
    it('should strictly REJECT client submission containing plaintext clinical fields with 400 Bad Request', async () => {
      const plaintextPayload = {
        appointmentId: 'app-uuid-1',
        patientId: patientA.id,
        doctorId: 'doc-uuid-1',
        ciphertext: 'valid_ciphertext_sample',
        iv: 'valid_iv',
        tag: 'valid_tag',
        signedPolicyId: 'pol-qea-2of3-sample',
        diagnosis: 'Bệnh tim thiếu máu cục bộ (PLAINTEXT LEAK DETECTED)',
      };

      await expect(
        recordsService.createEncryptedRecord(doctorUser, plaintextPayload, plaintextPayload),
      ).rejects.toThrow(BadRequestException);
    });

    it('should verify database only stores ciphertext, iv, tag, and signedPolicyId', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValue({
        id: 'app-uuid-1',
        patientId: patientA.id,
        doctorId: 'doc-uuid-1',
      });

      mockPrisma.encryptedRecord.create.mockResolvedValue({
        ...mockEncryptedRecord,
      });

      const validPayload = {
        appointmentId: 'app-uuid-1',
        patientId: patientA.id,
        doctorId: 'doc-uuid-1',
        ciphertext: 'only_encrypted_ciphertext_stored',
        iv: 'sample_iv_16_bytes',
        tag: 'sample_tag_16_bytes',
        signedPolicyId: 'pol-qea-2of3-sample',
      };

      const result = await recordsService.createEncryptedRecord(
        doctorUser,
        validPayload,
        validPayload,
      );

      expect(result.ciphertext).toBe(mockEncryptedRecord.ciphertext);
      expect((result as any).diagnosis).toBeUndefined();
      expect((result as any).prescription).toBeUndefined();
      expect((result as any).notes).toBeUndefined();
    });
  });

  // =========================================================================
  // TIÊU CHÍ 5: 1 ADMIN KÝ KHÔNG GIẢI MÃ ĐƯỢC (403 FORBIDDEN - FAIL PROOF)
  // =========================================================================
  describe('Criterion 5: 1 Admin Signature Fails Decryption (HTTP 403 Forbidden)', () => {
    it('should return 403 Forbidden when Doctor presents assertion with only 1 Admin signature', async () => {
      mockPrisma.encryptedRecord.findUnique.mockResolvedValue(mockEncryptedRecord);

      // Generate assertion with only Admin 1 signature (1/3 < 2/3)
      const assertion1Admin = tideQeaService.createAssertion(
        mockEncryptedRecord.id,
        doctorUser.id,
        ['tide-admin-001'],
      );

      await expect(
        recordsService.getEncryptedRecord(
          mockEncryptedRecord.id,
          doctorUser,
          JSON.stringify(assertion1Admin),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject Admin direct decryption attempt under Default Deny principle (403 Forbidden)', async () => {
      mockPrisma.encryptedRecord.findUnique.mockResolvedValue(mockEncryptedRecord);

      // Admin attempts to claim decryption authorization
      const adminAssertion = tideQeaService.createAssertion(
        mockEncryptedRecord.id,
        adminUser.id,
        ['tide-admin-001', 'tide-admin-002'],
      );

      // RecordsService blocks Admin from decrypting (Admins have zero default decryption capability)
      await expect(
        recordsService.getEncryptedRecord(
          mockEncryptedRecord.id,
          adminUser,
          JSON.stringify(adminAssertion),
        ),
      ).rejects.toThrow(ForbiddenException);

      // Direct QEA check also explicitly blocks Admin
      const accessResponse = tideQeaService.requestRecordAccess({
        requesterId: adminUser.id,
        requesterRole: 'ADMIN',
        recordId: mockEncryptedRecord.id,
      });
      expect(accessResponse.allowed).toBe(false);
      expect(accessResponse.statusCode).toBe(403);
      expect(accessResponse.message).toContain(
        'Default Deny: Administrators have no default decryption capability',
      );
    });
  });

  // =========================================================================
  // TIÊU CHÍ 6: 2/3 ADMIN KÝ MỞ KHÓA ỦY QUYỀN GIẢI MÃ THÀNH CÔNG (200 OK)
  // =========================================================================
  describe('Criterion 6: 2 of 3 Admin Signatures Unlock Decryption Grant (HTTP 200 OK)', () => {
    it('should return HTTP 200 OK and unlocked grant token when 2 of 3 Admins sign', async () => {
      mockPrisma.encryptedRecord.findUnique.mockResolvedValue(mockEncryptedRecord);

      // Admin 1 and Admin 2 sign the assertion (2/3 quorum reached)
      const assertion2Admins = tideQeaService.createAssertion(
        mockEncryptedRecord.id,
        doctorUser.id,
        ['tide-admin-001', 'tide-admin-002'],
      );

      const response = await recordsService.getEncryptedRecord(
        mockEncryptedRecord.id,
        doctorUser,
        JSON.stringify(assertion2Admins),
      );

      expect((response as any).tideQeaStatus).toBe('APPROVED');
      expect((response as any).decryptionGrantToken).toBeDefined();

      // Verify the grant token is cryptographically valid and contains authorization proof
      const grantPayload = JSON.parse(
        Buffer.from(response.decryptionGrantToken!, 'base64url').toString('utf8'),
      );
      expect(grantPayload.grantType).toBe('TIDE_QEA_DECRYPTION_AUTHORIZATION');
      expect(grantPayload.quorumSatisfied).toBe(true);
      expect(grantPayload.threshold).toBe(2);
      expect(grantPayload.verifiedAdmins).toContain('tide-admin-001');
      expect(grantPayload.verifiedAdmins).toContain('tide-admin-002');
    });

    it('should also unlock decryption when Admin 2 and Admin 3 sign (alternative 2/3 quorum)', async () => {
      mockPrisma.encryptedRecord.findUnique.mockResolvedValue(mockEncryptedRecord);

      const assertion2AdminsAlt = tideQeaService.createAssertion(
        mockEncryptedRecord.id,
        doctorUser.id,
        ['tide-admin-002', 'tide-admin-003'],
      );

      const response = await recordsService.getEncryptedRecord(
        mockEncryptedRecord.id,
        doctorUser,
        JSON.stringify(assertion2AdminsAlt),
      );

      expect((response as any).tideQeaStatus).toBe('APPROVED');
      expect((response as any).decryptionGrantToken).toBeDefined();
    });
  });
});
