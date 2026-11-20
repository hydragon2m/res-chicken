# Hướng dẫn kiểm thử Thực đơn & Bảng giá (Catalog)

1. Sao chép `.env.example` thành `.env` (hoặc dùng cấu hình mặc định trong `compose.yml`).
2. Khởi chạy toàn bộ hệ thống bằng Docker Compose:
   ```bash
   docker compose up -d --build
   ```
3. Kiểm tra trạng thái sẵn sàng của Backend API tại:
   - `http://localhost:3001/api/v1/health/live`
   - `http://localhost:3001/api/v1/health/ready`
4. Dịch vụ `migrate` sẽ tự động chạy toàn bộ 21 bản migration (tạo đủ 44 bảng dữ liệu) và chạy `npm run identity:seed` để nạp đầy đủ thực đơn, biến thể, lịch giá, nhóm tuỳ chọn sốt/topping, định mức BOM và tồn kho FEFO cho cả 2 chi nhánh (Quận 1 & Quận 7).
5. Đăng nhập tại `http://localhost:3000/login` bằng tài khoản Chủ chuỗi (`superadmin@chickres.local`) hoặc Quản lý chi nhánh (`manager@chickres.local`), sau đó mở `/admin/catalog/products` hoặc `/admin/catalog/categories`.
6. Tại đây có thể thêm/sửa danh mục, món ăn kèm hình ảnh, biến thể quy cách, nhóm tuỳ chọn sốt và lịch giá theo khung giờ. Quầy POS (`/pos`) sẽ tự động hiển thị các món đang hoạt động, còn hàng và có lịch giá hợp lệ.
