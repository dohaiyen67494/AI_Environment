# CareFlow Project Tasks

## Phase 1: Môi trường & Database Schema
- [x] TASK-101: Tạo Docker Compose (Postgres, NestJS, cấu hình TideCloak 8080) (@agent-a) [DONE]
- [x] TASK-102: Khởi tạo Prisma Schema và Migration cho Lịch khám & Hồ sơ (@agent-a) [DONE]
- [x] TASK-103: Viết script Seed dữ liệu: 1 phòng khám, 2 bác sĩ, 1 bệnh nhân, 3 admin (@agent-a) [DONE]

## Phase 2: Xác minh cốt lõi Tide (Core Proof - Ưu tiên số 1)
- [x] TASK-201: Cài đặt DPoP validation middleware trên NestJS (@agent-a) [DONE]
- [x] TASK-202: Thiết lập realm Tide QEA với chính sách 2/3 Admin (@agent-b) [DONE]
- [x] TASK-203: Viết test case chứng minh 1 admin ký KHÔNG giải mã được hồ sơ (@agent-b) [DONE]

## Phase 3: Nghiệp vụ Lịch hẹn & Hồ sơ mã hóa
- [x] TASK-301: Cài đặt API Đặt lịch với Idempotency-Key & chống race condition (@agent-a) [DONE]
- [x] TASK-302: Cài đặt API Đổi lịch (Reschedule) trong 1 Transaction (@agent-a) [DONE]
- [x] TASK-303: Cài đặt API Lưu và Lấy Ciphertext hồ sơ bệnh án (@agent-a) [DONE]

## Phase 4: Nghiệm thu & Hợp đồng Frontend
- [x] TASK-401: Xuất file OpenAPI / Swagger và hướng dẫn tích hợp DPoP cho Frontend (@agent-b) [READY_FOR_REVIEW]
- [x] TASK-402: Chạy bộ test nghiệm thu 6 tiêu chí mục 5 trong plan (@agent-b) [READY_FOR_REVIEW]

## Phase 5: Đóng gói bài thi (Hạn 18:00 22/10/2026)
- [x] TASK-501: Viết README.md (tối đa 300 từ, khớp 5 tiêu chí chấm điểm) (@agent-b) [READY_FOR_REVIEW]
- [x] TASK-502: Lập kịch bản video demo 2 phút theo đúng luồng đề bài (@agent-b) [READY_FOR_REVIEW]
