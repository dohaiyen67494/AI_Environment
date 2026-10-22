import { PrismaClient, Role, PolicyStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting CareFlow database seeding...');

  // 1. Seed Clinic (Phòng khám)
  const clinic = await prisma.clinic.upsert({
    where: { id: 'c1111111-1111-1111-1111-111111111111' },
    update: {},
    create: {
      id: 'c1111111-1111-1111-1111-111111111111',
      name: 'Phòng khám Đa khoa CareFlow Central',
      address: '123 Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
      phone: '+84 28 3822 1234',
      email: 'central@careflow.vn',
    },
  });
  console.log(`✅ Clinic seeded: ${clinic.name}`);

  // 2. Seed Services (Dịch vụ y tế)
  const serviceGeneral = await prisma.service.upsert({
    where: { name: 'Khám Nội Tổng Quát' },
    update: {},
    create: {
      id: 's1111111-1111-1111-1111-111111111111',
      name: 'Khám Nội Tổng Quát',
      description: 'Khám và tư vấn sức khỏe tổng quát cùng bác sĩ chuyên khoa',
      price: 200000,
      durationMinutes: 30,
      isActive: true,
    },
  });

  const serviceCardio = await prisma.service.upsert({
    where: { name: 'Khám Chuyên Khoa Tim Mạch' },
    update: {},
    create: {
      id: 's2222222-2222-2222-2222-222222222222',
      name: 'Khám Chuyên Khoa Tim Mạch',
      description: 'Chẩn đoán và điều trị bệnh lý tim mạch, đo điện tim và huyết áp',
      price: 350000,
      durationMinutes: 30,
      isActive: true,
    },
  });
  console.log(`✅ Services seeded: 2 services created`);

  // 3. Seed Admins (3 Quản trị viên để thỏa mãn Tide QEA 2/3 Admin threshold)
  const adminsData = [
    {
      id: 'a1111111-1111-1111-1111-111111111111',
      email: 'admin1@careflow.vn',
      fullName: 'Quản trị viên 1 (Nguyễn Minh Trí)',
      phone: '0911000001',
      tideId: 'tide-admin-001',
      role: Role.ADMIN,
    },
    {
      id: 'a2222222-2222-2222-2222-222222222222',
      email: 'admin2@careflow.vn',
      fullName: 'Quản trị viên 2 (Trần Thị Mai)',
      phone: '0911000002',
      tideId: 'tide-admin-002',
      role: Role.ADMIN,
    },
    {
      id: 'a3333333-3333-3333-3333-333333333333',
      email: 'admin3@careflow.vn',
      fullName: 'Quản trị viên 3 (Lê Hoàng Nam)',
      phone: '0911000003',
      tideId: 'tide-admin-003',
      role: Role.ADMIN,
    },
  ];

  for (const admin of adminsData) {
    await prisma.user.upsert({
      where: { email: admin.email },
      update: {},
      create: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        phone: admin.phone,
        tideId: admin.tideId,
        role: admin.role,
        passwordHash: '$2b$10$careflow_admin_hash_placeholder', // bcrypt placeholder
      },
    });
  }
  console.log(`✅ 3 Admins seeded (Ready for Tide QEA 2/3 threshold verification)`);

  // 4. Seed Doctors (2 Bác sĩ)
  // Doctor 1: Dr. Nguyễn Văn An (Tim mạch)
  const userDoctor1 = await prisma.user.upsert({
    where: { email: 'doctor.an@careflow.vn' },
    update: {},
    create: {
      id: 'd1111111-1111-1111-1111-111111111111',
      email: 'doctor.an@careflow.vn',
      fullName: 'BS. CKII Nguyễn Văn An',
      phone: '0922000001',
      tideId: 'tide-doctor-001',
      role: Role.DOCTOR,
    },
  });

  const doctor1 = await prisma.doctor.upsert({
    where: { userId: userDoctor1.id },
    update: {},
    create: {
      id: 'doc11111-1111-1111-1111-111111111111',
      userId: userDoctor1.id,
      clinicId: clinic.id,
      specialty: 'Tim mạch',
      licenseNumber: 'CCHN-TIM-012345',
      bio: 'Bác sĩ chuyên khoa Tim mạch với hơn 15 năm kinh nghiệm điều trị tim mạch can thiệp.',
    },
  });

  // Doctor 2: Dr. Trần Thị Bình (Nội tổng quát)
  const userDoctor2 = await prisma.user.upsert({
    where: { email: 'doctor.binh@careflow.vn' },
    update: {},
    create: {
      id: 'd2222222-2222-2222-2222-222222222222',
      email: 'doctor.binh@careflow.vn',
      fullName: 'ThS. BS Trần Thị Bình',
      phone: '0922000002',
      tideId: 'tide-doctor-002',
      role: Role.DOCTOR,
    },
  });

  const doctor2 = await prisma.doctor.upsert({
    where: { userId: userDoctor2.id },
    update: {},
    create: {
      id: 'doc22222-2222-2222-2222-222222222222',
      userId: userDoctor2.id,
      clinicId: clinic.id,
      specialty: 'Nội tổng quát',
      licenseNumber: 'CCHN-NOI-067890',
      bio: 'Thạc sĩ Bác sĩ Nội khoa, chuyên sâu khám sức khỏe định kỳ và quản lý bệnh mãn tính.',
    },
  });
  console.log(`✅ 2 Doctors seeded: ${userDoctor1.fullName}, ${userDoctor2.fullName}`);

  // 5. Seed Patient (1 Bệnh nhân)
  const patientUser = await prisma.user.upsert({
    where: { email: 'patient.cuong@gmail.com' },
    update: {},
    create: {
      id: 'p1111111-1111-1111-1111-111111111111',
      email: 'patient.cuong@gmail.com',
      fullName: 'Lê Quốc Cường',
      phone: '0933000001',
      tideId: 'tide-patient-001',
      role: Role.PATIENT,
    },
  });
  console.log(`✅ 1 Patient seeded: ${patientUser.fullName}`);

  // 6. Seed Shifts & Slots for Doctor 1 & Doctor 2
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Generate shifts for next 3 days
  for (let dayOffset = 1; dayOffset <= 3; dayOffset++) {
    const shiftDate = new Date(today);
    shiftDate.setDate(shiftDate.getDate() + dayOffset);

    // Morning shift: 08:00 - 12:00
    const morningStart = new Date(shiftDate);
    morningStart.setHours(8, 0, 0, 0);
    const morningEnd = new Date(shiftDate);
    morningEnd.setHours(12, 0, 0, 0);

    for (const doc of [doctor1, doctor2]) {
      const shift = await prisma.shift.create({
        data: {
          doctorId: doc.id,
          date: shiftDate,
          startTime: morningStart,
          endTime: morningEnd,
        },
      });

      // Generate 30-min slots: 8:00-8:30, 8:30-9:00, 9:00-9:30, 9:30-10:00, 10:00-10:30, 10:30-11:00, 11:00-11:30, 11:30-12:00
      let currentSlotTime = new Date(morningStart);
      while (currentSlotTime < morningEnd) {
        const slotEnd = new Date(currentSlotTime.getTime() + 30 * 60 * 1000);
        await prisma.slot.create({
          data: {
            doctorId: doc.id,
            shiftId: shift.id,
            startTime: currentSlotTime,
            endTime: slotEnd,
            isBooked: false,
          },
        });
        currentSlotTime = slotEnd;
      }
    }
  }
  console.log(`✅ Shifts and 30-minute Slots seeded for both doctors over 3 days`);

  // 7. Seed Initial Signed Policy for Tide QEA testing
  const signedPolicy = await prisma.signedPolicy.upsert({
    where: { id: 'pol-qea-2of3-sample' },
    update: {},
    create: {
      id: 'pol-qea-2of3-sample',
      policyDefinition: JSON.stringify({
        resource: 'MedicalRecord',
        action: 'DECRYPT_RECORD',
        threshold: 2,
        totalAdmins: 3,
        admins: ['tide-admin-001', 'tide-admin-002', 'tide-admin-003'],
        rule: 'REQUIRES_QEA_QUORUM_2_OF_3',
      }),
      signedToken: 'tide_qea_sample_signed_jwt_assertion_token_proof_2_of_3',
      thresholdRequired: 2,
      totalAdmins: 3,
      status: PolicyStatus.ACTIVE,
    },
  });
  console.log(`✅ Sample SignedPolicy seeded: ${signedPolicy.id}`);

  console.log('🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
