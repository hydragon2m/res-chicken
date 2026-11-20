# Hệ thống Giao diện Web Chick Res QSR (Next.js 16 + Tailwind CSS v4)

Phân hệ Frontend cung cấp giao diện hợp nhất cho Chủ chuỗi (Super Admin), Quản lý chi nhánh, Thu ngân quầy cảm ứng (Touch POS), Nhân viên bếp (KDS), Thủ kho FEFO và Cổng khách hàng (Đặt bàn, Săn Voucher, Quét QR gọi món tại bàn).

## Cấu trúc thư mục mã nguồn (`FE/src/`)

- `app/`: Các trang giao diện theo nhóm phân hệ nghiệp vụ:
  - `(quan-tri-he-thong)/admin/`: Bảng điều hành, Trung tâm chuỗi (`/admin/chain`), Thực đơn, Kho FEFO 9 phân hệ, Bàn & Đặt chỗ, Khuyến mãi, Báo cáo, Nhân sự, Nhật ký Audit và Cài đặt.
  - `(quay-ban-hang-pos)/pos/`: Giao diện bán hàng cảm ứng tại quầy thu ngân (`/pos`).
  - `(man-hinh-bep-kds)/kds/`: Màn hình điều phối bếp Trạm chiên (`/kds/frying`) và Trạm đóng gói (`/kds/packing`).
  - `(so-don-hang)/orders/`: Sổ tra cứu đơn hàng, in hóa đơn và xử lý hoàn tiền (`/orders`).
  - `(cong-khach-hang)/`: Cổng khách hàng đặt bàn trực tuyến (`/reservations`), săn mã giảm giá (`/vouchers`) và quét QR gọi món tại bàn (`/table/[token]`).
  - `(quan-tri-chuoi)/platform/`: Quản trị danh sách chi nhánh toàn hệ thống.
  - `(dang-nhap)/login/`: Trang đăng nhập tích hợp chọn nhanh 6 vai trò mẫu (`/login`).
- `tinh-nang/`: Các không gian làm việc chuyên sâu theo từng nghiệp vụ:
  - `quan-tri/`: Bảng điều khiển vận hành và quản lý đội ngũ nhân sự.
  - `thuc-don/`: Quản lý danh mục món ăn, biến thể, nhóm tuỳ chọn sốt và lịch giá.
  - `dieu-phoi-bep/`: Không gian làm việc màn hình bếp KDS thời gian thực.
  - `kho-nguyen-lieu/`: Không gian làm việc 9 phân hệ kho FEFO & định mức BOM (`giao-dien/`).
  - `ban-an/`: Quản lý đơn hàng gắn với bàn ăn.
- `thanh-phan/`: Các thành phần bố cục chung (Thanh bên `app-sidebar`, Đầu trang `site-header`, Khung ứng dụng `app-shell`) và bộ thành phần giao diện (`giao-dien/`).
- `thu-vien/`: Thư viện tiện ích xác thực (`auth`), ngữ cảnh chi nhánh (`store-context`), định dạng tiền tệ/thời gian (`format`) và in hóa đơn nhiệt (`print-receipt`).
- `moc-xu-ly/`: Các React Hook hỗ trợ giao diện đáp ứng trên thiết bị di động (`use-mobile`).

## Khởi chạy giao diện

```bash
# Cài đặt thư viện
npm install

# Chạy máy chủ phát triển (cổng 3000)
npm run dev

# Biên dịch bản Production
npm run build
```
