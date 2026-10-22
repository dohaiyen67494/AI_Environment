# CareFlow Shared Memory & Handoff Log

## Phase 1 Handoff: Môi trường & Database Schema (Agent A)
**Branch:** `feature/phase-1-setup`  
**Status:** `[DONE]` (Merged into `main` by Agent C)  
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

### 4. Báo cáo Thẩm định của Reviewer (Agent C Review Approval - Phase 1)
- **Người thẩm định**: Agent C (Reviewer)
- **Kết quả Review**: **PASS (PHÊ DUYỆT 100%)**
- **Đánh giá chi tiết**:
  1. **Cổng chạy**: Tuân thủ nghiêm ngặt Backend port `3333` và TideCloak port `8080`.
  2. **Bảo mật**: `EncryptedRecord` tuyệt đối không có plaintext; `SignedPolicy` tuân thủ mô hình mật mã Tide QEA, không giả lập biến đếm.
  3. **Chống Race condition**: `Slot @@unique([doctorId, startTime])`, `Appointment.slotId @unique` và `PrismaExceptionFilter` chuyển lỗi `P2002` thành `409 Conflict`.
  4. **Kiểm thử**: Đạt 15/15 tests, `tsc` 0 error, build production thành công.
- **Hành động**: Đã duyệt merge branch `feature/phase-1-setup` vào nhánh chính `main`. Chuyển tiếp sang Phase 2.

---

## Phase 2 Handoff & Tide Verification Notes (Agent A & Agent B)
**Branch:** `feature/phase-2-tide-core`  
**Status:** `[DONE]` (Merged into `main` by Agent C)  
**Date:** 2026-10-22

---

### 1. DPoP Validation Middleware / Guard theo chuẩn RFC 9449 (TASK-201)
- **Module:** `src/auth/dpop/dpop.module.ts` (Global Module)
- **Files chính:**
  - `src/auth/dpop/dpop.types.ts`: Định nghĩa types chuẩn JWK, DPoPHeader, DPoPPayload, DPoPValidationResult.
  - `src/auth/dpop/dpop-replay-cache.service.ts`: Service bộ nhớ đệm (In-Memory Replay Cache) theo dõi các `jti` đã sử dụng kèm thời gian sống TTL (mặc định 300s) và dọn dẹp định kỳ để chống Replay Attack tuyệt đối.
  - `src/auth/dpop/dpop.service.ts`: Xác thực cấu trúc JWS, chữ ký số (ES256, RS256), `typ: dpop+jwt`, cấm `alg: none`/`HS*`, cấm private key trong JWK, kiểm tra `htm`, `htu`, `iat`, và `ath` hash của access token.
  - `src/auth/dpop/dpop.guard.ts`: Guard `@UseGuards(DPoPGuard)` tự động chặn request không hợp lệ và gắn context `request.dpop`.
  - `src/auth/dpop/dpop.decorator.ts`: Decorator `@CurrentDPoP()` và `@CurrentDPoPJwk()`.

---

### 2. Cấu hình Realm TideCloak & QEA Multi-Admin Threshold Policy (TASK-202)
- **Đường dẫn cấu hình:** `config/tide/careflow-realm.json` và `tidecloak/careflow-realm.json`
- **Thông số Realm:**
  - `realm`: `careflow`, cổng TideCloak: `8080`, cổng Backend API: `3333`.
  - `client`: `careflow-backend` (OpenID Connect, Client Authentication type: `client-secret`, Secret: `tidecloak-secret`, `dpop.bound.access.tokens: true`, PKCE `S256`).
- **Danh sách 3 Quản trị viên phục vụ QEA 2/3 (ECDSA P-256):**
  - **Admin 1**: `admin1@careflow.vn` (Tide ID: `tide-admin-001`, QEA Signer #1)
  - **Admin 2**: `admin2@careflow.vn` (Tide ID: `tide-admin-002`, QEA Signer #2)
  - **Admin 3**: `admin3@careflow.vn` (Tide ID: `tide-admin-003`, QEA Signer #3)
- **Định nghĩa Chính sách QEA Multi-Admin Threshold Policy:**
  - `policyId`: `pol-qea-2of3-sample`, `threshold`: `2` (bắt buộc ít nhất 2 admin ký độc lập), `totalAdmins`: `3`.
  - `defaultDeny`: `true`, `allowAdminDirectDecryption`: `false`, `allowDoctorDirectDecryption`: `false`.

---

### 3. Kết quả Kiểm thử & Bằng chứng Xác minh Thực tế (TASK-203)
Toàn bộ **20/20 test cases** của `tide-qea.service.spec.ts` đều vượt qua 100%:
- **Test 1 (FAIL Proof)**: Chỉ 1 Admin ký -> `status: DENIED`, HTTP 403 Forbidden (`Quorum threshold not met: Requires at least 2 distinct Admin signatures, received 1`).
- **Test 2 (PASS Proof)**: Đủ 2/3 Admin ký -> `status: APPROVED`, cấp `decryptionGrantToken` để client giải mã cục bộ.
- **Test 3 (Default Deny)**: Admin cố giải mã trực tiếp bị chặn `403 Forbidden` (`Default Deny: Administrators have no default decryption capability`). Bác sĩ không có token QEA bị chặn `403 Forbidden`.
- **Test 4 (Replay Attack)**: Replay nonce hoặc JTI bị chặn ngay lập tức.
- **Bổ sung**: 1 Admin ký 2 lần bị khử trùng lặp (chỉ tính 1 chữ ký hợp lệ -> DENIED). Attacker dùng khóa lạ mạo danh bị loại bỏ.

---

### 4. Báo cáo Thẩm định của Reviewer (Agent C Review Approval - Phase 2)
- **Người thẩm định**: Agent C (Reviewer)
- **Kết quả Review**: **PASS (PHÊ DUYỆT 100%)**
- **Hành động**: Đã duyệt merge branch `feature/phase-2-tide-core` vào `main`. Chuyển tiếp sang Phase 3.

---

## Phase 3 Handoff: Nghiệp vụ Lịch hẹn & Hồ sơ mã hóa (Agent A)
**Branch:** `feature/phase-3-business-api`  
**Status:** `[READY_FOR_REVIEW]`  
**Date:** 2026-10-22

---

### 1. API Đặt lịch với Idempotency-Key & Chống Race Condition (TASK-301)
- **`GET /v1/me`**:
  - Trả về thông tin hồ sơ của người dùng hiện tại (kèm thông tin bác sĩ và phòng khám nếu role là DOCTOR).
- **`PATCH /v1/me`**:
  - Cập nhật thông tin cá nhân (`fullName`, `phone`, `bio`).
  - **Bảo mật then chốt**: Chặn tuyệt đối hành vi người dùng tự sửa đổi `role`. Bất kỳ payload nào chứa trường `role` đều bị từ chối với HTTP `400 Bad Request`.
- **`GET /v1/doctors/:id/availability`**:
  - Lấy danh sách các slot còn trống (`isBooked: false`) của bác sĩ.
  - Hỗ trợ query tham số `?date=YYYY-MM-DD` để lọc theo ngày khám.
- **`GET /v1/appointments`**:
  - **Kiểm soát quyền riêng tư bất biến**: Bệnh nhân chỉ xem được lịch hẹn của chính mình.
  - Bệnh nhân cố tình query lịch hẹn của bệnh nhân khác (`?patientId=...`) lập tức bị chặn với HTTP `403 Forbidden` (`Patients are strictly forbidden from viewing appointments of other patients`).
  - Bác sĩ chỉ xem các cuộc hẹn liên quan đến mình.
- **`POST /v1/appointments`**:
  - Header: `Idempotency-Key` (ngăn chặn duplicate submit khi mạng bị trễ hoặc retry).
  - Nếu `Idempotency-Key` đã tồn tại: Hệ thống trả về bản ghi cuộc hẹn cũ ngay lập tức (Idempotent response) mà không tạo trùng lặp.
  - **Chống Race condition & 409 Conflict**:
    - Chạy trong `prisma.$transaction`. Kiểm tra trạng thái slot: nếu slot đã bị đặt (`isBooked: true`), lập tức trả về HTTP `409 Conflict`.
    - Ràng buộc DB cấp độ vật lý: `Appointment.slotId @unique` đảm bảo không thể có 2 bản ghi cuộc hẹn gắn cùng 1 slot -> `PrismaExceptionFilter` tự động bắt lỗi `P2002` và trả về HTTP `409 Conflict`.

---

### 2. API Đổi lịch (Reschedule) trong 1 Transaction duy nhất & Check-in (TASK-302)
- **`POST /v1/appointments/:id/reschedule`**:
  - **Thực thi trong 1 Database Transaction duy nhất (`prisma.$transaction`)**:
    1. Kiểm tra quyền sở hữu cuộc hẹn (Bệnh nhân B không thể đổi lịch của Bệnh nhân A -> 403 Forbidden).
    2. Kiểm tra slot mới: Nếu slot mới đã bị đặt (`isBooked: true`), trả về HTTP `409 Conflict`.
    3. Giải phóng slot cũ: Cập nhật slot cũ thành `isBooked: false`.
    4. Chiếm slot mới: Cập nhật slot mới thành `isBooked: true`.
    5. Cập nhật trạng thái cuộc hẹn thành `RESCHEDULED`.
    6. Ghi Audit Log trong cùng transaction.
- **`POST /v1/appointments/:id/check-in`**:
  - Cập nhật trạng thái cuộc hẹn thành `CHECKED_IN` và ghi vết AuditLog.

---

### 3. API Lưu và Lấy Ciphertext Hồ sơ Bệnh án & Tích hợp Tide QEA (TASK-303)
- **`POST /v1/records`**:
  - **ĐIỀU KIỆN BẤT BIẾN**: Chỉ chấp nhận và lưu trữ `ciphertext`, `iv`, `tag`, `signedPolicyId`.
  - **Phòng thủ đa tầng**: Nếu client gửi bất kỳ trường plaintext nào (`diagnosis`, `prescription`, `notes`, `clinicalNotes`, `plaintext`), hệ thống lập tức ném lỗi HTTP `400 Bad Request`: `Security Invariant Violation: Plaintext clinical field is strictly forbidden. Backend only stores ciphertext, iv, tag, and signedPolicyId.`
- **`GET /v1/records/:id`**:
  - **ĐIỀU KIỆN BẤT BIẾN**: Backend KHÔNG BAO GIỜ giải mã plaintext.
  - Trả về `ciphertext` và `signedPolicy`.
  - **Tích hợp TideQeaService**:
    - Khi Bác sĩ gửi kèm header `x-tide-qea-assertion`:
      - Nếu đủ **2/3 Admin ký hợp lệ**: Trả về `tideQeaStatus: APPROVED` kèm `decryptionGrantToken` để client giải mã cục bộ qua Tide KMS SDK.
      - Nếu chỉ có **1 Admin ký**: Trả về HTTP `403 Forbidden` (`Quorum threshold not met: Requires at least 2 distinct Admin signatures, received 1`).
      - Nếu Admin cố giải mã trực tiếp: Trả về HTTP `403 Forbidden` (`Default Deny: Administrators have no default decryption capability`).
    - Nếu không gửi kèm QEA assertion: Trả về ciphertext và trạng thái `PENDING_QUORUM`.

---

### 4. Kết quả Kiểm thử Toàn bộ Dự án
- **Tổng số Test Cases:** **82/82 PASS (100%)** qua **12 Test Suites**.
  - `schema-invariants.spec.ts`: Đạt kiểm tra các ràng buộc schema bất biến.
  - `prisma-exception.filter.spec.ts`: Đạt kiểm tra chuyển `P2002` thành `409 Conflict`.
  - `dpop.service.spec.ts` & `dpop.guard.spec.ts`: Đạt kiểm tra RFC 9449 DPoP và Replay attack.
  - `tide-qea.service.spec.ts`: Đạt kiểm tra QEA 2/3 threshold (1 admin fail, 2 admin pass).
  - `users.service.spec.ts`: Đạt kiểm tra lấy profile và chặn tự sửa role.
  - `doctors.service.spec.ts`: Đạt kiểm tra lấy slot trống của bác sĩ.
  - `appointments.service.spec.ts`: Đạt kiểm tra Idempotency-Key, chống race condition 409 Conflict, Reschedule trong 1 Transaction, chặn Bệnh nhân A xem lịch Bệnh nhân B (403 Forbidden).
  - `records.service.spec.ts`: Đạt kiểm tra chặn plaintext khi lưu hồ sơ, cấp grant token khi đủ 2/3 QEA, từ chối khi chỉ có 1 admin ký (403 Forbidden).
- **TypeScript Typecheck (`tsc --noEmit`):** 0 errors.
- **Build Production (`npm run build`):** Thành công 100%.


---

### 5. Báo cáo Thẩm định của Reviewer (Agent C Review Approval - Phase 3)
- **Người thẩm định**: Agent C (Reviewer)
- **Kết quả Review**: **PASS (PHÊ DUYỆT 100%)**
- **Đánh giá chi tiết**:
  1. **Chống Race Condition & Idempotency-Key**: `POST /v1/appointments` xử lý chuẩn xác idempotency token; khi xung đột slot đồng thời ném đúng mã lỗi HTTP `409 Conflict`.
  2. **Giao dịch Toàn vẹn (Single Transaction)**: `POST /v1/appointments/:id/reschedule` được bọc trọn vẹn trong `prisma.$transaction`, giải phóng slot cũ, chiếm slot mới và ghi audit log đồng thời, đảm bảo không có rủi ro mất mát dữ liệu hoặc trạng thái dở dang.
  3. **Bảo mật Hồ sơ Bệnh án**: `POST /v1/records` chặn đứng 100% các payload chứa trường plaintext. `GET /v1/records/:id` không giải mã trên backend, kết nối chặt chẽ với cơ chế chứng minh đa chữ ký 2/3 Tide QEA để cấp `decryptionGrantToken`.
  4. **Kiểm soát Quyền riêng tư**: Bệnh nhân không thể xem lịch khám hoặc hồ sơ của bệnh nhân khác (trả về `403 Forbidden`). Không thể tự đổi `role` qua `PATCH /v1/me`.
  5. **Chất lượng Kiểm thử**: 82/82 tests pass 100%, build production thành công.
- **Hành động**: Đã duyệt merge branch `feature/phase-3-business-api` vào nhánh chính `main`. Chuyển giao sang Phase 4 & Phase 5 cho Agent B!
