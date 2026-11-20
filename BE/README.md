# Hệ thống Backend Chick Res QSR (NestJS + Prisma + PostgreSQL 16)

Phân hệ Backend điều hành toàn bộ nghiệp vụ chuỗi nhà hàng gà rán phục vụ nhanh (QSR), quản lý 44 bảng dữ liệu chuẩn hóa và phân quyền đa chi nhánh (Store-Scoped RBAC).

## Cấu trúc thư mục mã nguồn (`BE/src/`)

- `ban-va-dat-cho/`: Quản lý sơ đồ bàn ăn, đặt bàn trực tuyến và gọi món bằng mã QR tại bàn.
- `bao-cao/`: Tổng hợp báo cáo doanh thu, lợi nhuận gộp, ca làm việc và xuất báo cáo.
- `ca-lam-viec/`: Quản lý mở/đóng ca thu ngân, đối soát tiền mặt và bút toán két tiền.
- `cai-dat/`: Cấu hình thông tin cửa hàng, thuế suất VAT, giờ mở cửa và mẫu hóa đơn.
- `cau-hinh/`: Kiểm tra và nạp biến môi trường hệ thống.
- `chi-nhanh/`: Trung tâm điều hành chuỗi đa chi nhánh, đồng bộ thực đơn/định mức BOM và luân chuyển kho liên chi nhánh.
- `co-so-du-lieu/`: Kết nối Prisma ORM với cơ sở dữ liệu PostgreSQL 16.
- `dieu-phoi-bep/`: Điều phối vé bếp KDS (Trạm chiên gà & Trạm đóng gói trả món).
- `don-hang/`: Xử lý vòng đời đơn hàng POS, QR tại bàn, mang về và kiểm tra chống trùng giao dịch (`Idempotency-Key`).
- `kho-nguyen-lieu/`: Quản lý kho 9 phân hệ theo nguyên tắc FEFO (Hết hạn trước - Xuất trước), lô hàng, định mức BOM, kiểm kê và xuất hủy.
- `khuyen-mai/`: Quản lý chiến dịch khuyến mãi, phát hành mã giảm giá (Voucher) và kiểm soát lượt sử dụng.
- `kiem-tra-he-thong/`: Điểm cuối kiểm tra trạng thái sống/sẵn sàng của dịch vụ (`/api/v1/health/live`, `/api/v1/health/ready`).
- `mien-nghiep-vu/`: Các thực thể và quy tắc bất biến cốt lõi của miền nghiệp vụ.
- `nhat-ky-kiem-toan/`: Ghi nhận nhật ký kiểm toán bảo mật bất biến (`AuditLog`).
- `su-kien/`: Phát sự kiện đồng bộ thời gian thực (SSE) cho màn hình POS, KDS và Bảng điều hành.
- `thanh-toan/`: Xử lý thanh toán tiền mặt, QR thủ công, VietQR động và hoàn tiền.
- `thuc-don/`: Quản lý danh mục món, sản phẩm, biến thể quy cách, nhóm tuỳ chọn sốt/topping và lịch giá.
- `xac-thuc-phan-quyen/`: Xác thực Argon2, JWT, phiên đăng nhập và kiểm soát quyền hạn RBAC theo chi nhánh.

## Các lệnh vận hành chính

```bash
# Cài đặt thư viện
npm install

# Sinh kiểu dữ liệu Prisma Client
npm run prisma:generate

# Chạy toàn bộ Migration tạo đủ 44 bảng dữ liệu
npm run prisma:deploy

# Nạp dữ liệu mẫu đầy đủ cho toàn bộ 44 bảng ở cả 2 chi nhánh (Q1 & Q7)
npm run identity:seed

# Biên dịch dự án
npm run build

# Khởi chạy môi trường phát triển
npm run start:dev
```
