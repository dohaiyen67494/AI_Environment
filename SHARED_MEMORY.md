# CareFlow Shared Memory & Handoff Log

## Phase 1 Handoff: Môi trường & Database Schema (Agent A)
**Branch:** `feature/phase-1-setup`  
**Status:** `[READY_FOR_REVIEW]`  
**Date:** 2026-10-22

---

### 1. Hạ tầng Docker & Cấu hình môi trường (TASK-101)
- **`docker-compose.yml`**:
  - `careflow-postgres`: PostgreSQL 16 Alpine, port `5432`, healthcheck tích hợp.
  - `careflow-tidecloak`: TideCloak/Keycloak 24.0.1, cổng bất biến `8080:8080`.
  - `careflow-backend`: NestJS API containerized qua multi-stage `Dockerfile`, cổng bất biến `3333:3333`.
- **Cấu hình môi trường (`.env`, `.env.example`)**:
  - `PORT=3333`
  - `DATABASE_URL="postgresql://careflow_user:careflow_password@localhost:5432/careflow_db?schema=public"`
  - `TIDECLOAK_URL="http://localhost:8080"` (TideCloak realm: `careflow`, clientId: `careflow-backend`)

---

### 2. Thiết kế Database Schema & Ràng buộc bất biến (TASK-102)
File: `prisma/schema.prisma`

#### Các models & Ràng buộc then chốt:
1. **Chống Race Condition & Đặt trùng Slot (Invariant Constraint #3)**:
   - Model `Slot`: Có ràng buộc `@@unique([doctorId, startTime])` đảm bảo cùng 1 bác sĩ không thể có 2 slot trùng giờ.
   - Model `Appointment`: Có trường `slotId String @unique` đảm bảo mỗi slot chỉ có thể gắn với tối đa 1 lịch hẹn ở cấp độ cơ sở dữ liệu.
   - Model `Appointment`: Có trường `idempotencyKey String? @unique` ngăn chặn submit trùng lặp khi retry qua mạng.
   - Global Filter `PrismaExceptionFilter` (`src/common/filters/prisma-exception.filter.ts`): Bắt lỗi mã `P2002` của Prisma (Unique constraint violation) và chuyển hóa tự động thành HTTP `409 Conflict`.
2. **Bảo mật Hồ sơ Bệnh án (Invariant Constraint #2)**:
   - Model `EncryptedRecord`: **TUYỆT ĐỐI KHÔNG CÓ BẤT KỲ TRƯỜNG PLAINTEXT NÀO**. Chỉ lưu trữ:
     - `ciphertext`: Chuỗi mã hóa dữ liệu khám bệnh (Text / Base64).
     - `iv`: Initialization Vector.
     - `tag`: Authentication Tag (GCM).
     - `signedPolicyId`: Khóa ngoại tham chiếu đến `SignedPolicy`.
3. **Chính sách Tide QEA Đa Quản trị viên (Invariant Constraint #2)**:
   - Model `SignedPolicy`: Lưu `policyDefinition` và `signedToken` mật mã từ Tide QEA với `thresholdRequired: 2` (2/3 Admin).
   - **Cam kết**: Không dùng biến đếm giả lập (`approvalCount` fake) trong database; quyền giải mã chỉ được cấp khi có chứng chỉ QEA thật.
4. **AuditLog**: Ghi vết mọi hoạt động (`action`, `resource`, `resourceId`, `userId`, `ipAddress`, `timestamp`).

---

### 3. Dữ liệu Seed mẫu (TASK-103)
File: `prisma/seed.ts`

| Đối tượng | Định danh / Email | Ghi chú |
| :--- | :--- | :--- |
| **Clinic** | `Phòng khám Đa khoa CareFlow Central` | ID: `c1111111-1111-1111-1111-111111111111` |
| **Admin 1** | `admin1@careflow.vn` | Tide ID: `tide-admin-001`, Phục vụ kiểm thử QEA 2/3 |
| **Admin 2** | `admin2@careflow.vn` | Tide ID: `tide-admin-002`, Phục vụ kiểm thử QEA 2/3 |
| **Admin 3** | `admin3@careflow.vn` | Tide ID: `tide-admin-003`, Phục vụ kiểm thử QEA 2/3 |
| **Doctor 1** | `doctor.an@careflow.vn` | BS. CKII Nguyễn Văn An, Tim mạch, ID: `doc11111-1111-1111-1111-111111111111` |
| **Doctor 2** | `doctor.binh@careflow.vn` | ThS. BS Trần Thị Bình, Nội tổng quát, ID: `doc22222-2222-2222-2222-222222222222` |
| **Patient** | `patient.cuong@gmail.com` | Lê Quốc Cường, ID: `p1111111-1111-1111-1111-111111111111` |
| **Services** | `Khám Nội Tổng Quát` (200.000đ)<br>`Khám Chuyên Khoa Tim Mạch` (350.000đ) | Thời lượng mỗi slot: 30 phút |
| **Shifts & Slots** | Ca sáng 08:00 - 12:00 trong 3 ngày tiếp theo | Mỗi ca gồm 8 slot 30 phút cho từng bác sĩ |
| **SignedPolicy** | `pol-qea-2of3-sample` | Policy QEA 2/3 Admin threshold sample |

---

### 4. Kết quả kiểm thử & Độ bao phủ (Test Results)
- **Kiểm thử Schema Invariants (`src/prisma/schema-invariants.spec.ts`)**: PASS (100%)
  - Đảm bảo đầy đủ enum `Role` (ADMIN, DOCTOR, PATIENT)
  - Đảm bảo đầy đủ enum `AppointmentStatus`
  - Đảm bảo `EncryptedRecord` không chứa bất kỳ trường plaintext nào
  - Đảm bảo `Slot` và `Appointment` có unique constraint chống đặt trùng
  - Đảm bảo `SignedPolicy` không chứa biến đếm mock admin
- **Kiểm thử Exception Filter (`src/common/filters/prisma-exception.filter.spec.ts`)**: PASS (100%)
  - `P2002` -> `409 Conflict`
  - `P2025` -> `404 Not Found`
  - `P2003` -> `400 Bad Request`
- **Kiểm thử Controllers & Services**: PASS (100%)
- **TypeScript Typecheck (`tsc --noEmit`)**: 0 errors
- **Build (`npm run build`)**: Thành công

---

## Tide Verification Notes
*(Agent B ghi lại kết quả test QEA 2/3 admin để dùng làm tư liệu cho video demo)*
