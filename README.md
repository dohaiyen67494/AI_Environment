# CareFlow Backend - RMIT UNLOCKED

Hệ thống đặt lịch khám bệnh và quản lý hồ sơ y tế mã hóa với cơ chế kiểm soát ủy quyền đa quản trị viên **Tide QEA (Quorum Execution & Authorization)**.

## 5 Tiêu Chí Cốt Lõi

1. **Hạ tầng Chuẩn Cổng:**
   - **Backend API:** Cổng `3333` (NestJS, Swagger UI tại `/api/docs`).
   - **TideCloak Identity & QEA:** Cổng `8080` (Realm: `careflow`).

2. **Bảo mật Hồ sơ Zero-Knowledge & Tide QEA 2/3 Admin:**
   - Backend **chỉ lưu Ciphertext** và `SignedPolicy`. Tuyệt đối không tạo endpoint giải mã trên server và chặn đứng mọi payload chứa plaintext (`400 Bad Request`).
   - Phê duyệt mật mã thực tế qua Tide QEA: **1 Admin ký bắt buộc FAIL** (`403 Forbidden`). Đủ **2/3 Admin ký mới PASS** (`200 OK`), cấp grant token cho client tự unseal khóa và giải mã cục bộ.

3. **Chống Race Condition & Toàn Vẹn Lịch Hẹn:**
   - Ràng buộc Unique cấp DB đảm bảo 2 yêu cầu đặt trùng slot cùng thời điểm trả về **`409 Conflict`**. Hỗ trợ `Idempotency-Key`.
   - Nghiệp vụ đổi lịch (Reschedule) thực thi nguyên tử trong **1 Database Transaction duy nhất**.

4. **Chuẩn DPoP RFC 9449 Chống Replay Attack:**
   - Tích hợp DPoP Proof gắn khóa client (`ES256`). Replay cache ngăn chặn token phát lại (`401 Unauthorized`).

5. **Đóng Gói & Khởi Chạy 1 Lệnh Duy Nhất:**
   - Khởi động toàn bộ Postgres, TideCloak và NestJS API:
     ```bash
     docker compose up --build
     ```
   - Chạy bộ 95 acceptance & unit tests:
     ```bash
     npm test
     ```
