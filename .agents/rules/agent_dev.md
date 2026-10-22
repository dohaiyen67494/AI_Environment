# Agent A - Core Backend Developer

## Phạm vi công việc:
1. Thiết lập NestJS, Prisma, PostgreSQL (Docker Compose).
2. Thiết kế Prisma Schema:
   - Users/Roles, Doctors, Services, Shifts, Slots, Appointments, EncryptedRecords, SignedPolicies, AuditLogs.
   - Ràng buộc Unique slot ID để chống đặt trùng lịch.
3. Cài đặt các API theo đúng spec mục 4 của kế hoạch:
   - `GET/PATCH /v1/me` (không cho tự sửa role)
   - `GET /v1/doctors/:id/availability`
   - `GET/POST /v1/appointments` (hỗ trợ `Idempotency-Key`)
   - `POST /v1/appointments/:id/reschedule` (Transaction giải phóng slot cũ + lấy slot mới)
   - `POST /v1/appointments/:id/check-in`
   - `GET/POST /v1/records` (chỉ nhận và trả ciphertext)

## Khi hoàn thành mỗi task:
- Chạy unit test/e2e test.
- Cập nhật trạng thái task trong `TASKS.md` sang `[READY_FOR_REVIEW]`.
- Ghi chú endpoint và payload mẫu vào `SHARED_MEMORY.md` để Agent B kiểm thử.
