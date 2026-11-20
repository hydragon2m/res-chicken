# Hướng dẫn vận hành Màn hình Bếp (KDS)

1. Khởi chạy hệ thống với `docker compose up --build -d` và đăng nhập bằng tài khoản Nhân viên Bếp (`kitchen@chickres.local`) hoặc Quản lý (`manager@chickres.local`).
2. Hệ thống đã nạp sẵn các vé bếp mẫu ở cả 3 trạng thái: **Chờ chế biến (`QUEUED`)**, **Đang chiên/chế biến (`PREPARING`)** và **Sẵn sàng trả món (`READY`)**.
3. Tại quầy `/pos`, khi thu ngân tạo đơn mới và xác nhận thanh toán (Tiền mặt hoặc QR), đơn hàng sẽ tự động sinh vé bếp mới chuyển xuống màn hình KDS trong cùng giao dịch CSDL.
4. Mở `/kds/frying` (Trạm Chiên), bấm **Nhận làm** để chuyển vé sang `PREPARING`, sau đó bấm **Báo sẵn sàng** để chuyển sang `READY` (hệ thống tự động khấu trừ nguyên liệu tại Khu sơ chế bếp theo định mức BOM và lô FEFO).
5. Mở `/kds/packing` (Trạm Đóng Gói), bấm **Đã bàn giao** sau khi giao khay đồ ăn cho khách hoặc nhân viên phục vụ bàn.
