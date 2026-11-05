# POS walkthrough

Sau khi Catalog có ít nhất một variant đang bán (giá hiện hành và không sold-out), chạy:

```powershell
docker compose up --build -d
```

Mở `http://localhost:3000/pos`, đăng nhập bằng tài khoản có quyền Cashier hoặc cao hơn, rồi chọn cửa hàng.

1. Nhập tiền đầu ca và chọn **Mở ca**.
2. Chọn món/variant. Với món có option group, chọn modifier trong hộp thoại rồi thêm vào giỏ.
3. Tăng/giảm số lượng, sau đó chọn **Tạo đơn**.
4. Chọn **Tiền mặt** hoặc **Xác nhận QR**. Tiền mặt tạo một cash movement trong ca; QR thủ công chỉ xác nhận payment.
5. Sau thanh toán, chọn **In hóa đơn** để dùng hộp in của trình duyệt. Người có quyền phù hợp có thể hoàn tiền; cashier chỉ có thể huỷ đơn chưa thanh toán.
6. Khi kết ca, nhập số tiền thực tế vào ô **Đóng ca**. POS hiển thị số kỳ vọng, còn API lưu số khai báo và chênh lệch. Manager/Admin có thể ghi adjustment có lý do bắt buộc.

Các lệnh tạo ca, tạo đơn và thu tiền yêu cầu `Idempotency-Key`; POS tự tạo key cho mỗi lần bấm. Nếu trình duyệt hay mạng gửi lại cùng request, API trả lại cùng bản ghi thay vì tạo đơn/payment thứ hai.

Có màn [tra cứu đơn](/orders) cho 100 đơn gần nhất của cửa hàng, bao gồm snapshot món/modifier và payment status.

Khi cần tích hợp ngoài UI, gọi `POST /api/v1/shifts/:shiftId/close` với `Idempotency-Key` và `{ "declaredCash": ... }`. Response lưu `expectedCash`, `declaredCash` và `variance`. Các endpoint `cancel`, `refund` và `adjustment` cũng bắt buộc `Idempotency-Key`.

Smoke walkthrough đã chạy trên Compose ngày 2026-10-12: mở ca 100.000đ, đơn cash 110.000đ, đơn QR 55.000đ, số tiền mặt kỳ vọng 210.000đ và variance khi đóng ca là 0.
