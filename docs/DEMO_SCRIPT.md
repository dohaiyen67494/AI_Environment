# Kịch Bản Video Demo 2 Phút - CareFlow Backend (RMIT UNLOCKED)

- **Thời lượng:** 2 phút (120 giây)
- **Mục tiêu:** Trình diễn trực quan toàn bộ 5 tiêu chí cốt lõi, tập trung vào điểm nhấn công nghệ: **Tide QEA Multi-Admin (2/3 Admin)** và **Zero-Knowledge Architecture**.
- **Môi trường demo:** Terminal (Docker, npm test), Swagger UI (`http://localhost:3333/api/docs`), và Postman/cURL.

---

## Bảng Phân Cảnh Chi Tiết Từng Giây (Storyboard & Script)

| Thời gian | Cảnh quay / Thao tác Màn hình | Lời thoại thuyết minh (Voiceover Script) |
| :---: | :--- | :--- |
| **0:00 - 0:15** | **Khởi động hệ thống:**<br>- Mở Terminal chạy: `docker compose up -d`.<br>- Show `docker ps`: thấy container `careflow-backend` (port `3333`), `careflow-tidecloak` (port `8080`), và `postgres` (port `5432`).<br>- Mở trình duyệt vào `http://localhost:3333/api/docs` (Swagger UI). | *"Xin chào Ban giám khảo! Đây là CareFlow Backend. Hệ thống khởi chạy bằng một lệnh Docker duy nhất với hai cổng bất biến: Backend API cổng 3333 và TideCloak cổng 8080, sẵn sàng phục vụ với tài liệu OpenAPI Swagger đầy đủ."* |
| **0:15 - 0:30** | **Đặt lịch & Chống Race Condition (409 Conflict):**<br>- Gửi 2 request đồng thời vào cùng một slot khám bệnh của Bác sĩ An (`POST /v1/appointments`).<br>- Request 1: Nhận `201 Created` thành công.<br>- Request 2: Lập tức nhận **`409 Conflict`** (*"The requested slot is already booked"*).<br>- Minh họa header `Idempotency-Key` ngăn chặn gửi trùng. | *"Đầu tiên là tính toàn vẹn nghiệp vụ. Khi hai bệnh nhân cùng bấm đặt vào một khung giờ trong cùng một tích tắc, cơ chế ràng buộc cơ sở dữ liệu chặn đứng xung đột, trả về chính xác 409 Conflict. Đơn đặt đồng thời hỗ trợ Idempotency-Key chống gửi lặp."* |
| **0:30 - 0:50** | **Đổi lịch trong 1 Transaction & Lưu Hồ sơ Zero-Knowledge:**<br>- Bệnh nhân đổi sang slot mới (`POST /v1/appointments/:id/reschedule`) -> Thành công trong **1 Database Transaction duy nhất** (Slot cũ giải phóng, slot mới khóa).<br>- Bác sĩ lưu hồ sơ bệnh án (`POST /v1/records`):<br>  + Test thử gửi kèm trường plaintext `diagnosis` -> Bị backend từ chối ngay lập tức với **`400 Bad Request`**.<br>  + Gửi payload hợp lệ chỉ chứa `ciphertext`, `iv`, `tag`, `signedPolicyId` -> Lưu thành công. | *"Tiếp theo, nghiệp vụ đổi lịch diễn ra trọn vẹn trong một giao dịch cơ sở dữ liệu nguyên tử. Về hồ sơ bệnh án, CareFlow áp dụng mô hình Zero-Knowledge: Backend tuyệt đối không lưu plaintext và từ chối 400 Bad Request nếu client gửi plaintext. Cơ sở dữ liệu chỉ lưu trữ ciphertext và chính sách ký số."* |
| **0:50 - 1:25** | **TRỌNG TÂM: Thẩm định Tide QEA (1 Admin ký -> FAIL):**<br>- Bác sĩ gửi yêu cầu mở khóa hồ sơ (`GET /v1/records/:id`) kèm Assertion chỉ có **1 Admin ký** (`tide-admin-001`).<br>- Terminal log hiện:<br>`[TIDE QEA FAIL PROOF] Quorum threshold not reached: required 2, received 1 valid admin signature(s)`.<br>- Response API: **`403 Forbidden`** (*"Quorum threshold not met: Requires at least 2 distinct Admin signatures, received 1. Decryption authorization denied."*). | *"Và đây là trái tim bảo mật của CareFlow: Cơ chế Tide QEA Đa Quản trị viên. Bác sĩ yêu cầu quyền giải mã hồ sơ nhưng chỉ có 1 Admin phê duyệt. Ngưỡng 2/3 không thỏa mãn! Backend lập tức từ chối với mã lỗi 403 Forbidden. Cả Admin lẫn Bác sĩ đều không có quyền giải mã mặc định."* |
| **1:25 - 1:50** | **TRỌNG TÂM: Thẩm định Tide QEA (2/3 Admin ký -> PASS):**<br>- Admin thứ 2 (`tide-admin-002`) ký số ES256 vào Assertion.<br>- Bác sĩ gửi lại request với đủ 2 chữ ký số hợp lệ.<br>- Terminal log hiện:<br>`[TIDE QEA PASS PROOF] Quorum threshold SATISFIED: 2/3 Admin signatures verified. Decryption authorization unlocked.`<br>- Response API: **`200 OK`** kèm `decryptionGrantToken`.<br>- Giải thích: Client dùng token này unseal khóa tại KMS để tự giải mã AES-GCM trên máy khách. | *"Khi có sự đồng thuận của 2 trên 3 Admin với chữ ký số mật mã thật, ngưỡng Quorum được thỏa mãn! Backend trả về 200 OK kèm Decryption Grant Token. Bác sĩ sử dụng token này để mở khóa trực tiếp tại client thông qua Tide KMS. Backend tuyệt đối không can thiệp vào dữ liệu giải mã."* |
| **1:50 - 2:00** | **Tổng kết & Bàn giao Hợp đồng Frontend:**<br>- Show kết quả chạy `npm test`: **95/95 test cases passed 100%**.<br>- Trình chiếu file OpenAPI hợp đồng Frontend (`docs/openapi.json`) và tài liệu tích hợp DPoP RFC 9449 chống Replay Attack (`docs/frontend-integration.md`). | *"CareFlow vượt qua toàn diện 95/95 test cases kiểm thử tự động, chuẩn hóa DPoP RFC 9449 chống phát lại token và sẵn sàng bàn giao cho Frontend qua chuẩn OpenAPI. Xin cảm ơn Ban giám khảo!"* |

---

## Hướng Dẫn Kỹ Thuật Khi Quay Video Demo

### 1. Chuẩn bị trước khi quay:
1. Mở sẵn 3 cửa sổ màn hình:
   - **Màn hình trái:** Terminal hiển thị logs NestJS (`npm run start:dev` hoặc Docker logs) để người xem thấy rõ các dòng log:
     - `[TIDE QEA FAIL PROOF] Quorum threshold not reached: required 2, received 1...`
     - `[TIDE QEA PASS PROOF] Quorum threshold SATISFIED: 2/3 Admin signatures verified...`
   - **Màn hình phải trên:** Postman hoặc Swagger UI (`http://localhost:3333/api/docs`).
   - **Màn hình phải dưới:** Trình duyệt mở `docs/frontend-integration.md` và mã nguồn kiểm thử `test/acceptance.spec.ts`.
2. Kiểm tra âm thanh micro rõ ràng, tốc độ nói vừa phải, dứt khoát.

### 2. Các cURL lệnh mẫu dùng trong video:

#### Lệnh 1: Thử gửi Plaintext (Bị chặn 400 Bad Request)
```bash
curl -X POST http://localhost:3333/v1/records \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <DOCTOR_TOKEN>" \
  -d '{
    "appointmentId": "app-1",
    "patientId": "p-1",
    "doctorId": "d-1",
    "ciphertext": "cipher_data",
    "iv": "iv_data",
    "tag": "tag_data",
    "signedPolicyId": "pol-qea-2of3-sample",
    "diagnosis": "Benh tim (PLAINTEXT ERROR)"
  }'
```

#### Lệnh 2: Bác sĩ yêu cầu giải mã với 1 Admin ký (Bị chặn 403 Forbidden)
```bash
curl -X GET http://localhost:3333/v1/records/rec-uuid-1 \
  -H "Authorization: Bearer <DOCTOR_TOKEN>" \
  -H "x-tide-qea-assertion: <ASSERTION_WITH_ONLY_ADMIN1_SIGN>"
```
*Kết quả:* `403 Forbidden` - `Quorum threshold not met: Requires at least 2 distinct Admin signatures, received 1`.

#### Lệnh 3: Bác sĩ yêu cầu giải mã với 2/3 Admin ký (Thành công 200 OK)
```bash
curl -X GET http://localhost:3333/v1/records/rec-uuid-1 \
  -H "Authorization: Bearer <DOCTOR_TOKEN>" \
  -H "x-tide-qea-assertion: <ASSERTION_WITH_ADMIN1_AND_ADMIN2_SIGNS>"
```
*Kết quả:* `200 OK` - `tideQeaStatus: "APPROVED"`, `decryptionGrantToken: "ey..."`.
