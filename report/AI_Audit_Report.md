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

### Lần 2 – Bước 1: thiết kế workflow W2 và dữ liệu CSV

- Tên AI tool: Claude Code (Claude Opus 5.5)
- Ngày giờ: 2026-11-23 22:07
- Mục đích: Viết workflow W2 thành bảng bước với endpoint thật, giải thích phủ 3 nhóm endpoint; sửa script tạo user và sinh CSV; viết script reset trạng thái giữa các lượt chạy.
- Prompt của tôi:
  > Thiết kế workflow W2 thành bảng các bước (bước, nhóm endpoint, endpoint thật) kèm 1–2 câu giải thích mỗi nhóm auth/read/transactional được phủ thế nào. Sửa script tạo user thành quang_u001.. đủ cho số VU lớn nhất, sinh users.csv, categories.csv, coupons.csv, và script reset trạng thái giữa các lượt chạy.
- Output của AI (tóm tắt):
  - `notes/workflow-w2.md`: 8 bước login → `/api/users/me` → `/api/categories` → `/api/products` (JMeter lọc theo `category_id` bằng JSON Extractor) → `/api/products/:id` → `POST /api/cart` → `/api/apply-coupon` → `/api/checkout`, kèm assertion cho từng bước, giải thích phủ auth/read/transactional, bảng chống trùng với Quân/Phúc, cấu hình CSV (sharing All threads, recycle True).
  - Quyết định: API không có lọc category/phân trang (frontend và đặc tả FR-05 cũng không có) nên lọc ở phía JMeter, ghi phân trang là gap. Không gửi `user_id` và không gọi `/api/coupon-usage` để coupon không hết lượt giữa các vòng. Chỉ dùng coupon VIP100/BIGBUY với total 600000 (SAVE10 tính âm, EXPIRED hết hạn, backend so `>`).
  - `scripts/setup-users.js`: tạo `quang_u001..quang_u200` (mật khẩu `Quang1234!`), login thử trước khi đăng ký để không tạo trùng, xác nhận 200/200 login được, sinh `users.csv` (200 dòng), `categories.csv` (3 dòng), `coupons.csv` (2 dòng).
  - `scripts/reset-state.sh` (đổi tên từ `reset-lockout.sh`): mở khóa mọi user, xóa orders và coupon_usage của `quang_u*`, in giờ, login thử `quang_u001`. Giỏ hàng chỉ xóa được bằng restart backend (không có API xóa giỏ), restart thì phải chạy lại setup.
  - Đã chạy thật: setup tạo mới 200, chạy lần 2 báo "đã có 200" (không tạo trùng); reset mở khóa được user bị khóa và xóa được đơn test, login thử HTTP 200.
- Tôi đã review / sửa gì: _(sinh viên điền sau khi review)_
