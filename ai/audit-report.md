# AI Audit Report – HW05

I use AI tools for the following tasks.

Công cụ: Claude Code (model Claude Opus 5.5), chạy trong VS Code.

## Bước 2 – Dữ liệu CSV và tạo user test

**Thời gian:** 2026-11-23 21:47

**Prompt:**

> Viết script node tạo sẵn user test cho JMeter qua /api/register và sinh các file CSV (users, keywords, products, coupons) cho workflow login → search → detail → cart → coupon → checkout. Có vài user riêng để test sai mật khẩu/lockout, không dùng chung với user chạy chính.

**Ngữ cảnh AI tự đọc:** `HW02/eshop-sut/backend/server.js` (body/response của register, login, products, cart, apply-coupon, checkout), `database.js` (file DB `database.sqlite`, seed sản phẩm và coupon), response thật của `GET /api/products`.

**Output tóm tắt:**

- `scripts/setup-users.js`: đăng ký `perf001..perf200@eshop.com` và `lock01..lock05@eshop.com` (mật khẩu `Perf1234!`), bỏ qua user đã có, login lại để xác nhận, rồi ghi các file CSV. Kết quả chạy: 205/205 user login 200; chạy lần 2 không tạo trùng.
- `scripts/reset-lockout.sh`: dùng `sqlite3` đặt `login_attempts=0, locked_until=NULL` cho mọi user trong `backend/database.sqlite`.

| File | Số dòng (không tính header) | Dùng cho request |
|---|---|---|
| `data/users.csv` | 200 | POST /api/login (user chạy chính) |
| `data/lockout-users.csv` | 5 | POST /api/login sai mật khẩu (test lockout) |
| `data/keywords.csv` | 8 (5 từ tên sản phẩm, `Pro`, 2 từ không có kết quả: `Nokia`, `xyz123`) | GET /api/products?search= |
| `data/products.csv` | 5 | GET /api/products/:id, POST /api/cart |
| `data/coupons.csv` | 2 | POST /api/apply-coupon, POST /api/checkout (total_amount) |

**Chọn coupon:** dùng `VIP100` (giảm 100.000, min 300.000) và `BIGBUY` (giảm 50.000, min 500.000) với `total_amount=600000`.
- `/api/apply-coupon` không ghi lượt dùng (chỉ `/api/coupon-usage` mới ghi), nên chạy lặp không làm hết lượt. Không gửi `user_id` để khỏi phụ thuộc bảng `coupon_usage`.
- Không dùng `SAVE10`: coupon percent tính `total*(1-10)` nên discount âm (-5.400.000 với total 600.000).
- Không dùng `EXPIRED` (hết hạn 2020). Điều kiện là `total_amount > min_order_amount` (lớn hơn hẳn), nên total = 500.000 với BIGBUY bị từ chối -> chọn 600.000.

**Ghi chú lockout:** login sai cộng 2 vào `login_attempts`, nên lần sai thứ 2 đã khóa 3 phút (đặc tả là 3 lần). Đã thử với `lock01`: sai 3 lần -> 401, 401, 403; đúng mật khẩu khi đang khóa -> 403; sau `reset-lockout.sh` -> 200. User lockout tách riêng khỏi `users.csv` để không làm hỏng luồng chính. Restart backend sẽ reseed DB và mất user test, phải chạy lại `setup-users.js`.
