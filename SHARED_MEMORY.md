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

---

## Phase 2 Handoff & Tide Verification Notes (Agent B - Tide Security Specialist)
**Branch:** `feature/phase-2-tide-core`  
**Status:** `[READY_FOR_REVIEW]` (TASK-202 & TASK-203)  
**Date:** 2026-10-22  

---

### 1. Cấu hình Realm TideCloak & QEA Multi-Admin Threshold Policy (TASK-202)
- **Đường dẫn cấu hình:** 
  - `config/tide/careflow-realm.json` (được mount tự động vào Docker container tại `/opt/keycloak/data/import:ro` với cờ `--import-realm`)
  - `tidecloak/careflow-realm.json` (bản dự phòng chuẩn hóa)
- **Thông số Realm:**
  - `realm`: `careflow`, `displayName`: `CareFlow Secure Healthcare Realm`
  - `ports`: TideCloak chạy cổng `8080`, Backend API chạy cổng `3333`.
  - `roles`: `ADMIN`, `DOCTOR`, `PATIENT`
  - `client`: `careflow-backend` (OpenID Connect, Client Authentication type: `client-secret`, Secret: `tidecloak-secret`, `dpop.bound.access.tokens: true`, PKCE `S256`).
- **Danh sách người dùng & Cặp khóa mật mã (ECDSA P-256):**
  - **Admin 1**: `admin1@careflow.vn` (Tide ID: `tide-admin-001`, QEA Signer #1)
    - Public JWK: `{"kty":"EC","x":"dTnZ062v-QR3mvg_bAfC16AXTMULDLPCkgt6rvfAzPA","y":"by0wtG_Xm8utz6UGrDGur4PDvVCaHUJZHgTqLigCZio","crv":"P-256"}`
  - **Admin 2**: `admin2@careflow.vn` (Tide ID: `tide-admin-002`, QEA Signer #2)
    - Public JWK: `{"kty":"EC","x":"cExMpH-1qxh13IM2tECwDXZo-hcfg8V9LvPKdneaiNw","y":"wp_iU1dNt6lorr0CQaxn1sU2spcmULDFh9R01I9SCMo","crv":"P-256"}`
  - **Admin 3**: `admin3@careflow.vn` (Tide ID: `tide-admin-003`, QEA Signer #3)
    - Public JWK: `{"kty":"EC","x":"EK1xxFROofK3GGVq46ceOMZMJJ3s0zBStABvZdV70dk","y":"U5ypssCErJF4V8Z2G4tQ2MqkiUMPJ6Gw34FNvtk1gZk","crv":"P-256"}`
  - **Doctor 1**: `doctor.an@careflow.vn` (Tide ID: `tide-doctor-001`, BS. CKII Nguyễn Văn An)
  - **Doctor 2**: `doctor.binh@careflow.vn` (Tide ID: `tide-doctor-002`, ThS. BS Trần Thị Bình)
  - **Patient 1**: `patient.cuong@gmail.com` (Tide ID: `tide-patient-001`, Lê Quốc Cường)
- **Định nghĩa Chính sách QEA Multi-Admin Threshold Policy:**
  - `policyId`: `pol-qea-2of3-sample`
  - `policyName`: `CareFlow-MultiAdmin-Threshold-Policy`
  - `resource`: `MedicalRecord`
  - `action`: `DECRYPT_RECORD`
  - `rule`: `REQUIRES_QEA_QUORUM_2_OF_3`
  - `threshold`: `2` (bắt buộc ít nhất 2 admin ký độc lập)
  - `totalAdmins`: `3`
  - `defaultDeny`: `true`
  - `allowAdminDirectDecryption`: `false` (Admin không có quyền giải mã mặc định)
  - `allowDoctorDirectDecryption`: `false` (Bác sĩ không có quyền giải mã nếu không có phê duyệt QEA)

---

### 2. Bộ Test Suite Chứng minh Bảo mật Tide QEA (TASK-203)
- **Module:** `src/tide/tide.module.ts`
- **Files chính:**
  - `src/tide/tide-qea.types.ts`: Định nghĩa toàn bộ kiểu dữ liệu QEA policy, assertion, chữ ký số, kết quả thẩm định.
  - `src/tide/tide-qea-keys.fixture.ts`: Fixture cung cấp các cặp khóa ECDSA P-256 thực tế của 3 Admin và khóa giả mạo của Attacker để phục vụ kiểm thử mật mã thật.
  - `src/tide/tide-qea.service.ts`: Service lõi của CareFlow chịu trách nhiệm:
    - Tải và đồng bộ chính sách QEA từ `careflow-realm.json`.
    - Chuẩn hóa canonical serialization payload để ký và xác thực chữ ký số bằng Node.js `crypto` (thuật toán ES256).
    - Thẩm định điều kiện ngưỡng (Threshold): 1 Admin ký -> TỪ CHỐI; 2/3 Admin ký -> CHẤP THUẬN.
    - Khử trùng lặp chữ ký (Deduplication): 1 admin ký 2 lần chỉ tính 1 chữ ký hợp lệ.
    - Thực thi nguyên tắc "Default Deny": Admin hoặc Bác sĩ không có phê duyệt QEA thì KHÔNG BAO GIỜ giải mã được hồ sơ.
    - Cấp `decryptionGrantToken` mật mã dùng để mở khóa giải mã cục bộ tại client của bác sĩ (Backend tuyệt đối không giải mã plaintext).
  - `src/tide/tide-qea.service.spec.ts`: Bộ 20 test cases toàn diện chứng minh 4 điều kiện cốt lõi của đề bài.

---

### 3. Kết quả Kiểm thử & Bằng chứng Xác minh Thực tế (Tide Verification Notes)
Toàn bộ **20/20 test cases** của `tide-qea.service.spec.ts` và **61/61 test cases toàn dự án** đều vượt qua 100%:

| Nhóm Kiểm thử | Kết quả | Chi tiết chứng minh |
| :--- | :---: | :--- |
| **Test 1 (FAIL Proof)**<br>Chỉ 1 Admin ký | **FAIL (Expected)**<br>HTTP 403 / DENIED | - Khi chỉ Admin 1 ký: `verifiedAdminCount: 1 < 2` -> `status: DENIED`.<br>- Khi chỉ Admin 2 hoặc Admin 3 ký: Tương tự bị từ chối.<br>- Bác sĩ gửi request giải mã với token 1 admin: Nhận HTTP 403 Forbidden: `Quorum threshold not met: Requires at least 2 distinct Admin signatures, received 1`. |
| **Test 2 (PASS Proof)**<br>2/3 Admin ký | **PASS (Approved)**<br>HTTP 200 / APPROVED | - Admin 1 + Admin 2: Đạt ngưỡng `2/3` -> `status: APPROVED`, cấp `decryptionGrantToken`.<br>- Admin 2 + Admin 3: Đạt ngưỡng `2/3` -> `status: APPROVED`.<br>- Admin 1 + Admin 3: Đạt ngưỡng `2/3` -> `status: APPROVED`.<br>- Cả 3 Admin (3/3): Đạt ngưỡng -> `status: APPROVED`.<br>- Bác sĩ nhận HTTP 200 OK kèm token ủy quyền giải mã cục bộ. |
| **Test 3 (Default Deny)**<br>Không có phê duyệt QEA | **BLOCKED (403)**<br>Default Deny | - Admin cố giải mã trực tiếp: Bị chặn `403 Forbidden` (`Default Deny: Administrators have no default decryption capability under Tide zero-knowledge architecture`).<br>- Bác sĩ không có token QEA: Bị chặn `403 Forbidden`.<br>- Bệnh nhân cố giải mã: Bị chặn `403 Forbidden`.<br>- Token QEA bị mạo danh bác sĩ khác hoặc tráo hồ sơ: Bị chặn `403 Forbidden`. |
| **Test 4 (Replay Attack)**<br>Tấn công phát lại | **BLOCKED**<br>Replay Detected | - Gửi lại cùng 1 QEA assertion nonce: Bị chặn với log `Replay attack detected: Nonce '...' has already been used`.<br>- Phát lại DPoP proof token với cùng `jti`: Bị chặn với mã lỗi `replay_detected` / HTTP 401. |
| **Bổ sung: Chống gian lận mật mã** | **BLOCKED** | - 1 Admin ký 2 lần để giả lập 2 chữ ký: Hệ thống tự động khử trùng lặp -> Tính là 1 chữ ký -> Bị TỪ CHỐI (DENIED).<br>- Kẻ tấn công dùng khóa lạ ký mạo danh Admin: Chữ ký số không khớp Public Key trong Realm -> Bị TỪ CHỐI (0 valid signatures).<br>- Payload bị tráo đổi sau khi Admin ký: Xác minh chữ ký số SHA-256/ECDSA thất bại -> Bị TỪ CHỐI. |

---

### 4. Bằng chứng Trích xuất Log Thực tế (Tư liệu dựng Video Demo 2 phút)

```text
[Nest] LOG  [TideQeaService] Loaded Tide QEA policy from careflow-realm.json

>>> TEST 1: SINGLE ADMIN SIGN (FAIL PROOF)
[Nest] WARN [TideQeaService] [TIDE QEA FAIL PROOF] Quorum threshold not reached: required 2, received 1 valid admin signature(s) from [tide-admin-001].
Result: { isAuthorized: false, status: 'DENIED', verifiedAdminCount: 1, thresholdRequired: 2 }
Response: HTTP 403 Forbidden - "Quorum threshold not met: Requires at least 2 distinct Admin signatures, received 1. Decryption authorization denied."

>>> TEST 2: TWO ADMINS SIGN (PASS PROOF)
[Nest] LOG  [TideQeaService] [TIDE QEA PASS PROOF] Quorum threshold SATISFIED: 2/3 Admin signatures verified [tide-admin-001, tide-admin-002]. Decryption authorization unlocked.
Result: { isAuthorized: true, status: 'APPROVED', verifiedAdminCount: 2, thresholdRequired: 2 }
Response: HTTP 200 OK - "Tide QEA Quorum Verified (2/3 Admins): Client is authorized to decrypt the medical record locally."
GrantToken: eyJncmFudFR5cGUiOiJUSURFX1FFQV9ERUNSWVBUSU9OX0FVVEhPUklaQVRJT04iLCJwb2xpY3lJZCI6InBvbC1xZWEtMm9mMy1zYW1wbGUi...

>>> TEST 3: DEFAULT DENY PRINCIPLE
[Nest] WARN [TideQeaService] Default Deny: Admin (admin-super-id-001) attempted direct record decryption. Admins possess zero default decryption capability.
Response: HTTP 403 Forbidden - "Default Deny: Administrators have no default decryption capability under Tide zero-knowledge architecture. Medical records remain encrypted."

[Nest] WARN [TideQeaService] Default Deny: Doctor (doc11111-1111-1111-1111-111111111111) requested record rec-medical-test-record-001 without Tide QEA approval.
Response: HTTP 403 Forbidden - "Default Deny: Medical records cannot be decrypted without 2/3 Multi-Admin Tide QEA approval."

>>> TEST 4: DPOP & NONCE REPLAY ATTACK PREVENTION
[Nest] WARN [TideQeaService] QEA Assertion replay detected for nonce: qea-nonce-unique-test-12345
[Nest] WARN [DPoPService] DPoP Replay attack detected for JTI: 40d12f4f-5cac-4767-8c25-599e74d6412c
Response: { isValid: false, errorCode: 'replay_detected', error: "DPoP proof token has already been used" }
```

---

### 5. Tổng kết Trạng thái Phase 2
- **Cấu hình Realm TideCloak (TASK-202):** `[READY_FOR_REVIEW]`
- **Chứng minh Bảo mật Tide QEA 2/3 Admin (TASK-203):** `[READY_FOR_REVIEW]`
- **Tổng số Unit Tests toàn dự án:** `61/61 PASS (100%)`
- **TypeScript build:** `0 errors`
- Đã sẵn sàng chuyển giao cho **Agent C (Reviewer)** thẩm định và phê duyệt merge.
