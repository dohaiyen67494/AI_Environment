# CareFlow Backend - RMIT UNLOCKED Context & Constraints

## Mục tiêu dự án
Xây dựng backend NestJS cho CareFlow. Trọng tâm: Bác sĩ chỉ giải mã được hồ sơ khi được ít nhất 2/3 Admin phê duyệt qua Tide QEA.

## Các điều kiện bất biến (Invariant Constraints):
1. **Cổng chạy**: API cổng `3333`, TideCloak cổng `8080`.
2. **Bảo mật Hồ sơ**:
   - Backend chỉ lưu Ciphertext và Signed Policy; KHÔNG tạo endpoint giải mã trên backend.
   - Không được giả lập (fake/mock) phê duyệt nhiều admin bằng biến đếm trong database; bắt buộc phải chứng minh qua Tide QEA thật.
3. **Chống Race Condition**: Đặt trùng slot cùng thời điểm phải trả về `409 Conflict`. Đổi lịch phải nằm trong 1 database transaction duy nhất.
4. **Quy chuẩn Git**:
   - Agent A code trên branch `feature/*` và mở PR.
   - Agent B review, chạy test xác minh bảo mật trước khi cho phép merge.
