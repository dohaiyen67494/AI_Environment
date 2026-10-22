import { Role, AppointmentStatus, PolicyStatus, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

describe('CareFlow Schema Invariant Constraints', () => {
  const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
  let schemaContent: string;

  beforeAll(() => {
    schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  });

  describe('Role Enum Invariants', () => {
    it('should include ADMIN, DOCTOR, PATIENT roles', () => {
      expect(Role.ADMIN).toBe('ADMIN');
      expect(Role.DOCTOR).toBe('DOCTOR');
      expect(Role.PATIENT).toBe('PATIENT');
    });
  });

  describe('AppointmentStatus Enum Invariants', () => {
    it('should include required appointment states', () => {
      expect(AppointmentStatus.PENDING).toBe('PENDING');
      expect(AppointmentStatus.CONFIRMED).toBe('CONFIRMED');
      expect(AppointmentStatus.CHECKED_IN).toBe('CHECKED_IN');
      expect(AppointmentStatus.COMPLETED).toBe('COMPLETED');
      expect(AppointmentStatus.CANCELLED).toBe('CANCELLED');
      expect(AppointmentStatus.RESCHEDULED).toBe('RESCHEDULED');
    });
  });

  describe('EncryptedRecord Invariants (Security Constraint #2)', () => {
    it('should contain ciphertext, iv, tag, and signedPolicyId', () => {
      expect(schemaContent).toContain('model EncryptedRecord');
      expect(schemaContent).toContain('ciphertext');
      expect(schemaContent).toContain('iv');
      expect(schemaContent).toContain('tag');
      expect(schemaContent).toContain('signedPolicyId');
    });

    it('MUST NOT contain any plaintext medical fields', () => {
      const encryptedRecordBlock = schemaContent
        .split('model EncryptedRecord')[1]
        .split('}')[0]
        .replace(/\/\/.*$/gm, '') // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

      expect(encryptedRecordBlock).not.toMatch(/\bdiagnosis\b/i);
      expect(encryptedRecordBlock).not.toMatch(/\bprescription\b/i);
      expect(encryptedRecordBlock).not.toMatch(/\bnotes\b/i);
      expect(encryptedRecordBlock).not.toMatch(/\bclinicalNotes\b/i);
      expect(encryptedRecordBlock).not.toMatch(/\bplaintext\b/i);
    });
  });

  describe('Anti-Race Condition Slot Constraints (Constraint #3)', () => {
    it('must enforce unique constraint on Slot [doctorId, startTime]', () => {
      const slotBlock = schemaContent.split('model Slot')[1].split('}')[0];
      expect(slotBlock).toContain('@@unique([doctorId, startTime])');
    });

    it('must enforce 1-to-1 unique slot per Appointment [slotId @unique]', () => {
      const appointmentBlock = schemaContent
        .split('model Appointment')[1]
        .split('}')[0];
      expect(appointmentBlock).toContain('slotId');
      expect(appointmentBlock).toContain('@unique');
    });

    it('must support idempotencyKey on Appointment', () => {
      const appointmentBlock = schemaContent
        .split('model Appointment')[1]
        .split('}')[0];
      expect(appointmentBlock).toContain('idempotencyKey');
      expect(appointmentBlock).toContain('@unique');
    });
  });

  describe('Tide Multi-Admin QEA Signed Policy (Constraint #2)', () => {
    it('must NOT contain mock/fake approval counters in database', () => {
      const signedPolicyBlock = schemaContent
        .split('model SignedPolicy')[1]
        .split('}')[0];

      expect(signedPolicyBlock).not.toMatch(/\bapprovalCount\b/i);
      expect(signedPolicyBlock).not.toMatch(/\bapprovedAdminsCount\b/i);
      expect(signedPolicyBlock).not.toMatch(/\badminCount\b/i);
    });

    it('must store signed cryptographic policy tokens and threshold definition', () => {
      const signedPolicyBlock = schemaContent
        .split('model SignedPolicy')[1]
        .split('}')[0];

      expect(signedPolicyBlock).toContain('policyDefinition');
      expect(signedPolicyBlock).toContain('signedToken');
      expect(signedPolicyBlock).toContain('thresholdRequired');
    });
  });
});
