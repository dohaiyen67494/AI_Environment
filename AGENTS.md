# Antigravity Workspace Guidelines

Dự án này sử dụng mô hình 2 vai trò: **Developer (Dev)** và **Reviewer (QA)**.

## Quy tắc bắt buộc:
1. **Kiểm tra trạng thái**: Luôn đọc `TASKS.md` trước khi làm việc để biết tiến độ hiện tại.
2. **Tuân thủ vai trò**:
   - Nếu được giao vai trò **Developer**: Thực hiện theo quy tắc tại `.agents/rules/dev_role.md`.
   - Nếu được giao vai trò **Reviewer**: Thực hiện theo quy tắc tại `.agents/rules/reviewer_role.md`.
3. **Đồng bộ ngữ cảnh**: Sau khi xong việc hoặc bàn giao, luôn cập nhật `SHARED_MEMORY.md` và `TASKS.md`.
4. **An toàn Git**: Không commit trực tiếp vào `main`. Mọi code mới phải qua branch `feature/*`.
