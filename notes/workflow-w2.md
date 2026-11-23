# Workflow W2 – Browse & Coupon (20120359 – Quang)

Endpoint đã xác minh ở `notes/sut-endpoints.md`. Base URL `http://localhost:3000`.

## 1. Các bước

Mỗi vòng lặp của 1 VU:

| # | Bước | Nhóm | Endpoint thật | Dữ liệu / biến | Kiểm tra (assertion) |
|---|---|---|---|---|---|
| 1 | Login | Auth | `POST /api/login` `{"email":"${email}","password":"${password}"}` | `users.csv` → JSON Extractor `$.token` → `token` | 200 và có `$.token` |
| 2 | Xem profile | Auth | `GET /api/users/me` + `Authorization: Bearer ${token}` | `token` | 200 và `$.email == ${email}` |
| 3 | Xem danh mục | Read | `GET /api/categories` | – | 200 và có `$[0].id` |
| 4 | Danh sách sản phẩm theo category | Read | `GET /api/products` | `categories.csv` → `category_id`; JSON Extractor `$[?(@.category_id == ${category_id})].id`, Match No. `0` (ngẫu nhiên) → `product_id` | 200, `product_id` không rỗng |
| 5 | Xem chi tiết | Read | `GET /api/products/${product_id}` | `product_id`; extractor `$.price` → `price` | 200 và `$.id == ${product_id}` (vì id sai vẫn trả `200 {}`) |
| 6 | Thêm vào giỏ | Transactional | `POST /api/cart` `{"product_id":${product_id},"quantity":1,"price":${price}}` + token | `product_id`, `price` | 200 và message `Added to cart` |
| 7 | Áp coupon | Transactional | `POST /api/apply-coupon` `{"code":"${coupon_code}","total_amount":${total_amount}}` | `coupons.csv`; extractor `$.final_amount`, `$.coupon_id` | 200, `$.success == true`, `final_amount < total_amount` |
| 8 | Checkout | Transactional | `POST /api/checkout` `{"total_amount":${final_amount},"shipping_address":"HCM","coupon_id":${coupon_id}}` + token | `final_amount`, `coupon_id` | 200 và có `$.orderId` |

Think-time giữa các bước, số VU, ramp-up sẽ chọn ở Bước 2 (test plan).

### Cách hiện thực "danh sách theo category + phân trang"

- Backend **không có** lọc theo category và **không có** phân trang: `GET /api/products` chỉ đọc `?search=` (`server.js:141-157`). Gọi `?category_id=2&page=2&limit=1` vẫn trả đủ 5 sản phẩm.
- Frontend cũng không có: `Home.jsx:12-33` gọi `/api/products?search=` một lần rồi hiển thị hết dạng lưới, không có bộ lọc danh mục, không có nút trang.
- Đặc tả FR-05 chỉ yêu cầu "hiển thị danh sách tất cả sản phẩm dạng lưới" + tìm kiếm, **không yêu cầu** phân trang hay lọc category. Danh mục chỉ xuất hiện ở FR-06 (hiển thị danh mục trong trang chi tiết) và FR-14 (admin CRUD).
- Vì vậy mình làm bước read-heavy bằng API thật như sau: `GET /api/categories` (bước 3) → `GET /api/products` (bước 4) → JMeter tự lọc sản phẩm theo `category_id` lấy từ `categories.csv` bằng JSON Extractor → `GET /api/products/:id` (bước 5). Việc "lọc theo category" xảy ra ở phía client (JMeter), giống cách một client thật phải làm với API này.
- **Phân trang: không có ở API → gap, không test được.** Không tính là bug vì đặc tả không yêu cầu; ghi lại là khác biệt so với bảng phân công nhóm (mục 1.3 ghi "phân trang"). Với 5 sản phẩm thì `GET /api/products` trả toàn bộ, nếu dữ liệu lớn thì endpoint này sẽ chậm dần vì luôn `SELECT *` không giới hạn.

### Giải thích phủ 3 nhóm endpoint

- **Auth:** mỗi vòng VU login bằng tài khoản riêng trong `users.csv` (mật khẩu luôn đúng) rồi gọi `/api/users/me` bằng JWT vừa lấy, nên phủ cả bước cấp token lẫn bước kiểm tra token (FR-02, FR-04). Login đúng cũng ghi DB (`UPDATE login_attempts = 0`), nên đây là nhóm có ghi SQLite, và vì không dùng mật khẩu sai nên luồng tải không tự khóa tài khoản.
- **Read:** 3 request đọc liên tiếp: danh mục, toàn bộ sản phẩm, chi tiết 1 sản phẩm chọn theo category (FR-05, FR-06). Đây là phần nhiều request nhất trong vòng lặp và có `GET /api/products` trả nhiều dữ liệu nhất.
- **Transactional:** thêm vào giỏ (ghi RAM), áp coupon (đọc bảng coupons, tính tiền), checkout (`INSERT orders` vào SQLite) (FR-07, FR-08, FR-09). Checkout là thao tác ghi DB chính, dễ thấy ảnh hưởng của khóa ghi SQLite khi nhiều VU.

### Những gì cố ý không làm trong luồng tải

- Không gửi `user_id` trong apply-coupon và không gọi `POST /api/coupon-usage`: nếu ghi lượt dùng thì từ vòng thứ 2–3 của mỗi VU coupon sẽ bị từ chối 400 (BIGBUY 1 lần, VIP100 2 lần/user), lỗi do dữ liệu chứ không phải do hiệu năng. Backend chỉ kiểm tra lượt dùng khi có `user_id` (`server.js:386`).
- Không dùng SAVE10 (tính giảm giá âm, `server.js:399-401`) và EXPIRED (hết hạn).
- Không search (W1 của Quân), không sai mật khẩu/lockout (W3 của Phúc), không đọc lịch sử đơn (W3).

## 2. Bảng chống trùng với Quân / Phúc (theo mục 1.4)

| Tiêu chí | Quân (W1) | Quang (W2) | Phúc (W3) | Trùng? |
|---|---|---|---|---|
| Điểm vào read-heavy | search `GET /api/products?search=` | `GET /api/categories` → `GET /api/products` lọc theo category | `GET /api/products/:id` trực tiếp | Không |
| Có dùng coupon? | Không | Có (`POST /api/apply-coupon`) | Không | Không |
| Có bước phụ riêng? | Không | Profile (`GET /api/users/me`) | Lockout + lịch sử đơn | Không |
| Dữ liệu CSV chính | users, keywords | users, categories, coupons | users (đúng + sai), product IDs | Không |

W2 khác W1 và W3 ở cả 3 điểm (read, transactional, bước phụ), đạt yêu cầu "khác ít nhất 2/3".

## 3. Dữ liệu CSV

Sinh bằng `node scripts/setup-users.js` (đọc categories/products từ API thật):

| File | Header | Số dòng dữ liệu | Nội dung |
|---|---|---|---|
| `data/users.csv` | `email,password` | 200 | `quang_u001@eshop.com` .. `quang_u200@eshop.com`, mật khẩu `Quang1234!` |
| `data/categories.csv` | `category_id,category_name` | 3 | 1 Điện thoại, 2 Laptop, 3 Phụ kiện (chỉ lấy category có sản phẩm) |
| `data/coupons.csv` | `coupon_code,total_amount` | 2 | `VIP100,600000` và `BIGBUY,600000` |

Lý do chọn coupon: chỉ 2 mã fixed còn hạn và tính đúng. `total_amount = 600000` lớn hơn ngưỡng của cả hai (VIP100 300000, BIGBUY 500000) vì backend so `>` chứ không phải `>=`. Backend nhận `total_amount` do client gửi nên dùng số cố định cho dễ kiểm tra `final_amount` (500000 / 550000).

Cấu hình CSV Data Set Config trong JMeter:

| File | Sharing mode | Recycle on EOF | Stop thread on EOF | Lý do |
|---|---|---|---|---|
| `users.csv` | All threads | True | False | 200 dòng ≥ số VU lớn nhất dự kiến (~150–200), mỗi VU đọc 1 dòng khác nhau → mỗi VU 1 tài khoản, giỏ hàng không lẫn nhau. Recycle chỉ để không dừng khi VU lặp nhiều vòng. |
| `categories.csv` | All threads | True | False | Chỉ 3 dòng, quay vòng để các VU rải đều qua 3 category |
| `coupons.csv` | All threads | True | False | 2 dòng, quay vòng VIP100/BIGBUY |

Lưu ý về `users.csv`: CSV Data Set Config lấy dòng kế tiếp ở **mỗi vòng lặp**, nên vòng sau một VU có thể nhận tài khoản khác. Việc này không sao vì mỗi vòng đều login lại lấy token mới. Vì 200 dòng ≥ số VU đồng thời và các dòng được chia lần lượt, tại một thời điểm các VU gần như luôn dùng tài khoản khác nhau. Giỏ hàng có lẫn một chút cũng không làm checkout sai (checkout không đọc giỏ). Đã chốt trong test plan Load: `users.csv` để **All threads + Recycle True**. Không dùng `Current thread` vì khi đó mọi VU đọc cùng dòng đầu tiên (chung 1 tài khoản); không dùng Stop thread on EOF vì sau 200 vòng (khoảng 1,5 phút với 30 VU) test sẽ dừng sớm. Recycle an toàn vì mỗi vòng đều login lại bằng mật khẩu đúng, không ảnh hưởng lockout.

## 4. Reset giữa các lượt chạy

`sh scripts/reset-state.sh` (chạy khi JMeter đã dừng): mở khóa mọi user, xóa `orders` và `coupon_usage` của user `quang_u*`, in giờ chạy, login thử `quang_u001`.

Giỏ hàng nằm trong RAM backend, không có API xóa giỏ → chỉ xóa được bằng restart backend, mà restart thì DB bị reseed nên phải chạy lại `node scripts/setup-users.js`. Giỏ cũ không làm checkout lỗi (checkout không đọc giỏ) nhưng làm `GET /api/cart` và bộ nhớ process lớn dần, nên trước lượt chạy chính thức (nhất là soak) sẽ restart backend + chạy lại setup để số liệu RAM sạch.

## 5. Thông số Load

Máy: M2 Pro 10 nhân, 16 GB, backend Node + SQLite và JMeter chạy **cùng một máy** (xem `evidence/hardware/hardware.md`). Chỉ dùng Thread Group có sẵn (chưa cài plugin Custom Thread Groups).

| Thông số | Giá trị | Property JMeter | Lý do |
|---|---|---|---|
| Số VU | **30** | `threads=30` | Nằm giữa khoảng 20–50 gợi ý. Load là tải "bình thường", không phải tìm điểm gãy. Node chạy 1 luồng event loop, SQLite chỉ 1 connection nên mọi lệnh ghi (login `UPDATE`, checkout `INSERT`) xếp hàng tuần tự; 30 VU vẫn để dư chỗ cho Stress tăng tiếp. JMeter 30 thread rất nhẹ so với 16 GB, ít tranh CPU với backend. `users.csv` có 200 tài khoản, dư cho 30 VU. |
| Ramp-up | **90 giây** | `rampup=90` | Cứ 3 giây thêm 1 VU. Mỗi VU vào là login ngay (ghi DB), ramp chậm để không dồn 30 lệnh ghi cùng lúc ở giây đầu, giống người dùng vào dần. |
| Giữ tải | **5 phút** (300 giây) | `duration=390` | Thread Group chỉ có 1 ô Duration tính từ lúc bắt đầu, nên `duration = ramp 90 + giữ 300 = 390` giây. 5 phút đủ để có vài nghìn sample cho số liệu ổn định; chạy dài 10–15 phút để dành cho soak (Bước 4). |
| Think-time | **1–3 giây ngẫu nhiên** | Uniform Random Timer: constant 1000 ms + random 2000 ms | Người dùng thật đọc trang rồi mới bấm tiếp. Đặt trước mỗi bước 2–8 (7 lần, trung bình 2 giây) nên 1 vòng ≈ 14 giây. |
| Vòng lặp | Vô hạn (Loop Count `-1`) | | Dừng theo Duration, không theo số vòng. |

Ước lượng tải: 30 VU / ~14 giây mỗi vòng ≈ 2 vòng/giây ≈ **17 request/giây** (8 request mỗi vòng). Mức này máy chịu được thoải mái, đúng ý nghĩa Load.

Chạy thử nhỏ trước khi chạy thật: `-Jthreads=5 -Jrampup=10 -Jduration=60`.

Đường dẫn CSV trong plan là `${__P(datadir,../data)}/users.csv`. JMeter tính đường dẫn tương đối **theo thư mục chứa file .jmx** (`testplans/`), không theo thư mục đang đứng, nên `../data` đúng dù chạy lệnh từ đâu (đã thử chạy từ root repo và từ thư mục khác, đều đọc được CSV).

Chạy chính thức (từ root repo, reset trước):

```bash
bash scripts/reset-state.sh
jmeter -n -t testplans/20120359_Load_20261123.jmx -q user.properties \
       -l results/20120359_Load_20261123.jtl -e -o reports/20120359_Load_20261123_html
```
