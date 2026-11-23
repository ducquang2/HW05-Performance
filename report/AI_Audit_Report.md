# AI Audit Report – HW05 (20120359)

I use AI tools for the following tasks.

Công cụ: Claude Code (model Claude Opus 5.5) trong VS Code.

### Lần 1 – Bước 0: đọc SUT, ghi endpoint và cơ chế lockout

- Tên AI tool: Claude Code (Claude Opus 5.5)
- Ngày giờ: 2026-11-23 22:05
- Mục đích: Xác minh endpoint thật của backend EShop cho workflow W2, cách lấy token, quy tắc khóa tài khoản và cách mở khóa, DB, dữ liệu seed, trước khi viết test plan.
- Prompt của tôi:
  > Đọc source backend EShop và ghi lại cho tôi các endpoint workflow W2 cần dùng (login, profile, categories, danh sách/chi tiết sản phẩm, cart, apply-coupon, checkout): method, path, header, body mẫu, response mẫu, cách lấy token. Ghi luôn quy tắc khóa tài khoản, cách mở khóa, DB là gì, dữ liệu seed và coupon. Thử từng request bằng curl.
- Output của AI (tóm tắt):
  - File `notes/sut-endpoints.md`: bảng 9 endpoint W2 (login, `/api/users/me`, `/api/categories`, `/api/products`, `/api/products/:id`, `POST/GET /api/cart`, `/api/apply-coupon`, `/api/checkout`) với status và response lấy từ curl thật.
  - Token là JWT trong body login, gửi qua `Authorization: Bearer`, không có hạn.
  - Lockout: sai 2 lần đã khóa 3 phút (code cộng 2 mỗi lần sai, `server.js:54`), đặc tả là 3 lần / 30 giây. Mở khóa bằng `UPDATE users SET login_attempts=0, locked_until=NULL` trên `database.sqlite`, đã thử thật.
  - DB SQLite 1 file, restart backend sẽ DROP + reseed. Không có cột tồn kho nên không cần nạp kho.
  - Bảng 14 bất thường kèm file:dòng (API không lọc category/phân trang, sản phẩm không tồn tại trả 200 `{}`, checkout tin `total_amount` client và không xóa giỏ, coupon percent tính âm, so `>` thay vì `>=`, apply-coupon không cần token, register không chặn email trùng, trả password plaintext...).
- Tôi đã review / sửa gì: _(sinh viên điền sau khi review)_
