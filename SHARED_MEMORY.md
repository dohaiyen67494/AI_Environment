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

### 4. Báo cáo Thẩm định của Reviewer (Agent C Review Approval)
- **Người thẩm định**: Agent C (Reviewer)
- **Kết quả Review**: **PASS (PHÊ DUYỆT 100%)**
- **Đánh giá chi tiết**:
  1. **Cổng chạy**: Tuân thủ nghiêm ngặt Backend port `3333` và TideCloak port `8080`.
  2. **Bảo mật**: `EncryptedRecord` tuyệt đối không có plaintext; `SignedPolicy` tuân thủ mô hình mật mã Tide QEA, không giả lập biến đếm.
  3. **Chống Race condition**: `Slot @@unique([doctorId, startTime])`, `Appointment.slotId @unique` và `PrismaExceptionFilter` chuyển lỗi `P2002` thành `409 Conflict`.
  4. **Kiểm thử**: Đạt 15/15 tests, `tsc` 0 error, build production thành công.
- **Hành động**: Đã duyệt merge branch `feature/phase-1-setup` vào nhánh chính `main`. Chuyển tiếp sang Phase 2.

---

## Phase 2 Handoff: Xác minh cốt lõi Tide (Agent A)
**Branch:** `feature/phase-2-tide-core`  
**Status:** `[READY_FOR_REVIEW]` (TASK-201)  
**Date:** 2026-10-22

---

### Cài đặt DPoP Validation Middleware / Guard theo chuẩn RFC 9449 (TASK-201)
- **Module:** `src/auth/dpop/dpop.module.ts` (Global Module)
- **Files chính:**
  - `src/auth/dpop/dpop.types.ts`: Định nghĩa types chuẩn JWK, DPoPHeader, DPoPPayload, DPoPValidationResult.
  - `src/auth/dpop/dpop-replay-cache.service.ts`: Service bộ nhớ đệm (In-Memory Replay Cache) theo dõi các `jti` đã sử dụng kèm thời gian sống TTL (mặc định 300s) và dọn dẹp định kỳ để chống Replay Attack tuyệt đối.
  - `src/auth/dpop/dpop.service.ts`:
    - Xác thực cấu trúc 3 phần của JWS DPoP proof.
    - Kiểm tra `typ` header bắt buộc là `dpop+jwt`.
    - Kiểm tra `alg` header: Bắt buộc là thuật toán bất đối xứng (`ES256`, `RS256`, `PS256`, `EdDSA`); cấm tuyệt đối thuật toán đối xứng (`HS*`) và `none`.
    - Kiểm tra `jwk`: Xác thực public key của client, cấm tuyệt đối chứa khóa bí mật (`d`, `p`, `q`,...).
    - Kiểm tra `htm`: Khớp chính xác phương thức HTTP (GET, POST,...).
    - Kiểm tra `htu`: Khớp URI của request (bỏ query và fragment).
    - Kiểm tra `iat`: Không quá cũ (> 300s) và không ở tương lai (> 60s clock skew).
    - Kiểm tra `ath`: Khi có Access Token, tính `base64url(sha256(accessToken))` và so sánh với `ath` trong proof.
    - Xác thực chữ ký số bằng Node.js `crypto` với Public Key lấy từ header JWK.
    - Tích hợp hàm tiện ích `generateDPoPProof()` phục vụ kiểm thử và mô phỏng client.
  - `src/auth/dpop/dpop.guard.ts`:
    - NestJS `CanActivate` guard: Trích xuất `DPoP` header, `Authorization` (`DPoP <token>` hoặc `Bearer <token>`), URL và method.
    - Ném lỗi HTTP `401 Unauthorized` nếu thiếu header hoặc sai chữ ký/mismatch/replay.
    - Gắn `request.dpop = { payload, jwk }` vào request context cho các downstream controllers.
  - `src/auth/dpop/dpop.decorator.ts`:
    - `@CurrentDPoP()` và `@CurrentDPoPJwk()` để controller trích xuất DPoP context thuận tiện.

### Kết quả kiểm thử Unit Test:
- Tổng số test case: **41/41 PASS (100%)** qua 7 test suites.
- Bộ test `dpop.service.spec.ts` (14 test cases):
  - Pass với ES256 (P-256) và RS256.
  - Chặn header `typ` sai.
  - Chặn thuật toán đối xứng `HS256` và `alg: none`.
  - Chặn JWK chứa private key.
  - Chặn token hết hạn hoặc phát hành trong tương lai.
  - Chặn sai method `htm` và sai URI `htu`.
  - Chặn sai/thiếu hash access token `ath`.
  - Chặn chữ ký giả mạo/sai lệch.
  - **Chặn Replay Attack**: Gửi cùng 1 proof/jti lần 2 lập tức bị từ chối với lỗi `replay_detected`.
- Bộ test `dpop.guard.spec.ts` (6 test cases):
  - Chặn request thiếu header DPoP.
  - Cho phép request hợp lệ và gắn context.
  - Chặn sai method, sai URL, sai `ath`, và chặn Replay Attack ở cấp độ Guard.

---

## Tide Verification Notes
*(Agent B ghi lại kết quả test QEA 2/3 admin để dùng làm tư liệu cho video demo)*
