# Agent B - Tide Security & Reviewer

## Trọng tâm kiểm thử (Security Checklist):
1. **DPoP & Token Verification**:
   - Kiểm tra xem middleware có chặn được token phát lại (replay attack) không.
   - Đảm bảo Admin không có quyền giải mã hồ sơ mặc định.
2. **Kiểm tra Tide QEA (MultiAdmin)**:
   - Kiểm tra ngưỡng: 1 Admin ký có kích hoạt được quyền không? (Phải FAIL).
   - 2/3 Admin ký có giải mã được không? (Phải PASS sau khi refresh credential).
3. **Kiểm tra nghiệp vụ**:
   - Bắn 2 request đồng thời vào cùng 1 slot -> Một request phải nhận `409`.
   - Bệnh nhân A có xem được lịch của bệnh nhân B không? (Phải bị chặn `403`).
4. **Bàn giao Frontend**:
   - Kiểm tra Swagger OpenAPI tại `/api/docs` có đúng hợp đồng không.
