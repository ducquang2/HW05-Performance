# Ghi chú SUT EShop – endpoint dùng cho W2

Nguồn: `HW02/eshop-sut` (đã `git pull`, commit `7dc3e0d`), đọc `backend/server.js`, `backend/database.js`, `README.md`, `frontend-web/src/`.
Mọi response bên dưới là kết quả `curl` thật trên máy mình ngày 2026-11-23.

## 1. Môi trường

| Mục | Giá trị |
|---|---|
| Backend | Node.js + Express 5, chạy `node server.js` trong `backend/` |
| Base URL | `http://localhost:3000` (port cứng ở `server.js:8`) |
| Database | SQLite, file `backend/database.sqlite` (`database.js:4`), thư viện `sqlite3` (1 connection), `journal_mode = delete` |
| Xác thực | JWT (HS256), không dùng cookie/session |
| Giỏ hàng | Lưu trong RAM của process (`const userCarts = {}` ở `server.js:14`), không lưu DB |

**Lưu ý quan trọng:** mỗi lần khởi động backend, `database.js:13-20` sẽ `DROP TABLE` rồi tạo lại và seed. Restart = mất hết user/đơn test, phải chạy lại `scripts/setup-users.js`.

## 2. Lấy token

- `POST /api/login` trả về `token` trong body. Token là JWT, payload chỉ có `{"id":2,"role":"user","iat":...}`, **không có hạn** (`jwt.sign` không truyền `expiresIn`, `server.js:51`).
- Các API cần đăng nhập đọc header `Authorization: Bearer <token>` (`server.js:100-110`).
  - Không gửi token → `401 {"error":"Unauthorized"}`
  - Token sai → `403 {"error":"Forbidden"}`
- Trong JMeter: JSON Extractor `$.token` → biến `token`, Header Manager thêm `Authorization: Bearer ${token}`.

## 3. Endpoint W2

Header chung cho request có body: `Content-Type: application/json`.

| # | Method + path | Cần token | Body mẫu | Status | Response mẫu (thật) |
|---|---|---|---|---|---|
| 1 | `POST /api/login` | Không | `{"email":"test@eshop.com","password":"Test1234!"}` | 200 | `{"message":"Login successful","token":"eyJhbGciOiJIUzI1NiIs...","user":{"id":2,"name":"Test User","email":"test@eshop.com","password":"Test1234!","role":"user","login_attempts":0,"locked_until":null,...}}` |
| 1b | (sai mật khẩu / không có email) | | `{"email":"test@eshop.com","password":"sai"}` | 401 | `{"error":"Invalid email or password"}` |
| 1c | (đang bị khóa) | | mật khẩu đúng | 403 | `{"error":"Tài khoản đã bị khóa. Vui lòng thử lại sau."}` |
| 2 | `GET /api/users/me` | Có | – | 200 | `{"id":2,"name":"Test User","email":"test@eshop.com","password":"Test1234!","role":"user","login_attempts":0,"locked_until":null,"reset_token":null,"shipping_address":null,"phone":null}` |
| 3 | `GET /api/categories` | Không | – | 200 | `[{"id":1,"name":"Điện thoại"},{"id":2,"name":"Laptop"},{"id":3,"name":"Phụ kiện"}]` |
| 4 | `GET /api/products` | Không | – (chỉ hỗ trợ `?search=`) | 200 | mảng 5 sản phẩm: `[{"id":1,"name":"iPhone 15 Pro Max","price":30000000,"description":"...","imageUrl":"...","category_id":1}, ...]` |
| 4b | `GET /api/products?category_id=2&page=2&limit=1` | Không | – | 200 | **vẫn trả đủ 5 sản phẩm** (tham số bị bỏ qua) |
| 5 | `GET /api/products/:id` | Không | – | 200 | `/3` → `{"id":3,"name":"MacBook Pro M3","price":45000000,...,"category_id":2}`; `/4` → `"price":"6000000"` (chuỗi); `/999` → `{}` vẫn **200** |
| 6 | `POST /api/cart` | Có | `{"product_id":3,"quantity":1,"price":45000000}` | 200 | `{"message":"Added to cart"}` |
| 7 | `GET /api/cart` | Có | – | 200 | `[{"product_id":3,"quantity":1,"price":45000000},{"product_id":3,"quantity":1,"price":45000000}]` (thêm 2 lần cùng sp → 2 dòng) |
| 8 | `POST /api/apply-coupon` | **Không** | `{"code":"VIP100","total_amount":600000}` | 200 | `{"success":true,"coupon_id":3,"discount_amount":100000,"final_amount":500000,"message":"Áp dụng thành công! Giảm 100,000 ₫"}` |
| 8b | | | `{"code":"EXPIRED","total_amount":600000}` | 400 | `{"error":"Mã giảm giá đã hết hạn"}` |
| 8c | | | `{"code":"NOPE","total_amount":600000}` | 404 | `{"error":"Mã giảm giá không tồn tại hoặc đã bị vô hiệu hóa"}` |
| 8d | | | `{"code":"VIP100","total_amount":300000}` | 400 | `{"error":"Đơn hàng chưa đủ giá trị tối thiểu 300,000 ₫ để áp dụng mã này"}` |
| 9 | `POST /api/checkout` | Có | `{"total_amount":500000,"shipping_address":"HCM"}` | 200 | `{"message":"Checkout successful","orderId":2}` (không token → 401) |

Endpoint liên quan nhưng **không dùng** trong luồng tải W2:
- `POST /api/register` `{"name","email","password"}` → `{"message":"User registered successfully","id":N}`: chỉ dùng trong script tạo user.
- `POST /api/coupon-usage` (cần token) `{"coupon_id":3}`: frontend gọi sau checkout (`Checkout.jsx:54-58`) để ghi lượt dùng.
- `GET /api/orders/my-orders`: lịch sử đơn, phần của Phúc.
- `GET /api/products?search=`: phần của Quân.

## 4. Khóa tài khoản (FR-02)

Code (`server.js:40-64`):
- Đang khóa nếu `locked_until` > giờ hiện tại → trả 403, kể cả khi mật khẩu đúng.
- Sai mật khẩu: `login_attempts = login_attempts + 2`; nếu `>= 3` thì `locked_until = now + 180000 ms` (3 phút).
- Đúng mật khẩu (khi không bị khóa): `login_attempts = 0`, `locked_until = NULL`.

Đã thử thật với `test@eshop.com` (trước khi thử `login_attempts = 0`):

| Lần | Request | Status | `login_attempts`, `locked_until` sau đó |
|---|---|---|---|
| 1 | sai mật khẩu | 401 | `2`, NULL |
| 2 | sai mật khẩu | 401 | `4`, `2026-11-23T15:08:11Z` (3 phút sau) |
| 3 | đúng mật khẩu | 403 (bị khóa) | không đổi |
| 4 | giả lập hết hạn khóa (sửa `locked_until` về quá khứ), sai 1 lần | 401 | `6`, khóa tiếp 3 phút |
| 5 | sau khi reset bằng SQL, đúng mật khẩu | 200 | `0`, NULL |

Kết luận:
- **Thực tế sai 2 lần là bị khóa 3 phút** (đặc tả: sai 3 lần, khóa 30 giây).
- Có tự mở khóa sau 3 phút, nhưng bộ đếm không về 0 → hết khóa mà sai thêm 1 lần là khóa lại ngay.
- Không có endpoint admin để mở khóa.

**Cách mở khóa đã thử** (chạy được khi backend đang chạy, không cần restart):

```bash
sqlite3 /Users/qutubun/Documents/hcmus/ktpm/HW02/eshop-sut/backend/database.sqlite \
  "UPDATE users SET login_attempts = 0, locked_until = NULL;"
```

Cách khác: restart backend (DB bị reseed, mất user test) hoặc chờ 3 phút rồi login đúng.
W2 chỉ login bằng mật khẩu đúng, nên luồng tải không tự khóa tài khoản; nhánh sai mật khẩu là của Phúc.

## 5. Database SQLite – lưu ý khi tải

- Một file SQLite, một connection `sqlite3` dùng chung cho cả server; các lệnh ghi (login cập nhật `login_attempts`, checkout `INSERT orders`) bị xếp hàng tuần tự. Khi nhiều VU cùng ghi, latency của login/checkout có thể tăng do khóa ghi, không phải do CPU.
- Mỗi lần login đúng cũng chạy 1 `UPDATE users` → login cũng là thao tác ghi.
- Không chạy lệnh `sqlite3` reset **trong lúc** JMeter đang chạy (có thể gặp `database is locked`); chỉ reset giữa các lượt.

## 6. Dữ liệu seed (`database.js:83-111`)

User seed (DB hiện chỉ có 2 user này):

| id | email | password | role |
|---|---|---|---|
| 1 | admin@eshop.com | Admin123! | admin |
| 2 | test@eshop.com | Test1234! | user |

Category và sản phẩm:

| category_id | Tên | Sản phẩm (id – tên – giá) |
|---|---|---|
| 1 | Điện thoại | 1 – iPhone 15 Pro Max – 30.000.000; 2 – Samsung Galaxy S24 Ultra – 28.000.000 |
| 2 | Laptop | 3 – MacBook Pro M3 – 45.000.000 |
| 3 | Phụ kiện | 4 – Tai nghe AirPods Pro 2 – 6.000.000; 5 – Bàn phím cơ Keychron Q1 – 4.000.000 |

Coupon:

| code | type | discount_value | min_order_amount | expired_at | max_uses_per_user | Kết quả thử với total 600000 |
|---|---|---|---|---|---|---|
| SAVE10 | percent | 10 | 300000 | 2099-12-31 | 1 | 200 nhưng `discount_amount = -5400000`, `final_amount = 6000000` (sai) |
| BIGBUY | fixed | 50000 | 500000 | 2099-12-31 | 1 | 200, final 550000 |
| VIP100 | fixed | 100000 | 300000 | 2099-12-31 | 2 | 200, final 500000 |
| EXPIRED | percent | 20 | 100000 | 2020-01-01 | 1 | 400 hết hạn |

**Tồn kho:** bảng `products` không có cột tồn kho (`database.js:64-71`) và checkout không trừ kho → **không cần nạp tồn kho**, checkout không bao giờ lỗi vì hết hàng.

## 7. Bất thường thấy được (ảnh hưởng đến test)

| # | Vị trí | Mô tả | Ảnh hưởng tới W2 |
|---|---|---|---|
| 1 | `server.js:54` | Sai mật khẩu cộng 2 thay vì 1 → sai 2 lần đã khóa (đặc tả FR-02: 3 lần) | Không được dùng mật khẩu sai trong luồng tải |
| 2 | `server.js:57` | Khóa 180000 ms = 3 phút (đặc tả: 30 giây); hết khóa không reset bộ đếm | Reset bằng SQL giữa các lượt |
| 3 | `server.js:52`, `server.js:114` | Response login và `/api/users/me` trả cả `password` dạng plaintext | Lỗi bảo mật, ghi nhận |
| 4 | `server.js:20-29`, `database.js:53` | Register không kiểm tra email trùng (cột `email` không UNIQUE) | Script tạo user phải login thử trước để không tạo trùng |
| 5 | `server.js:141-157` | `GET /api/products` không có lọc category, không phân trang (tham số lạ bị bỏ qua) | Bước "category + phân trang" của W2 phải lọc ở phía JMeter (xem `workflow-w2.md`) |
| 6 | `server.js:161` | Sản phẩm không tồn tại trả `200 {}` thay vì 404 | Assertion phải kiểm tra `$.id`, không chỉ status |
| 7 | `server.js:162` | Sản phẩm id chẵn trả `price` là chuỗi | Assertion/extractor về giá cần chú ý kiểu |
| 8 | `server.js:14`, `server.js:290-295` | Giỏ trong RAM, `push` thẳng body, cùng sản phẩm tạo dòng mới (đặc tả FR-07: tăng số lượng) | Giỏ lớn dần theo số vòng lặp; chỉ xóa được bằng restart |
| 9 | `server.js:297-309` | Checkout lấy `total_amount` client gửi, không đọc giỏ, không xóa giỏ (vi phạm FR-08) | Checkout giỏ rỗng vẫn 200; giỏ không bao giờ trống |
| 10 | `server.js:363` | `/api/apply-coupon` không yêu cầu token (đặc tả C4) và lấy `user_id` từ body | Gọi không cần header Authorization |
| 11 | `server.js:379` | So sánh `total_amount > min_order_amount` (đặc tả C3: `>=`) | Total đúng bằng ngưỡng bị từ chối, CSV chọn total lớn hơn ngưỡng |
| 12 | `server.js:399-401`, `server.js:418-420` | Coupon percent tính `total * (1 - discount_value)` → giảm giá âm | Không dùng SAVE10 trong luồng tải |
| 13 | `server.js:386`, `server.js:444` | Chỉ kiểm tra lượt dùng khi body có `user_id`; apply-coupon không ghi lượt dùng, phải gọi riêng `/api/coupon-usage` | Không gửi `user_id` → coupon dùng lại được nhiều vòng |
| 14 | `database.js:13-20` | Mỗi lần start backend DROP + reseed toàn bộ DB | Restart = phải tạo lại user test |
