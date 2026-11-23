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

Sinh bằng `node scripts/setup-users.js [số user]` (mặc định 500; đọc categories/products từ API thật):

| File | Header | Số dòng dữ liệu | Nội dung |
|---|---|---|---|
| `data/users.csv` | `email,password` | 500 | `quang_u001@eshop.com` .. `quang_u500@eshop.com`, mật khẩu `Quang1234!` |
| `data/categories.csv` | `category_id,category_name` | 3 | 1 Điện thoại, 2 Laptop, 3 Phụ kiện (chỉ lấy category có sản phẩm) |
| `data/coupons.csv` | `coupon_code,total_amount` | 2 | `VIP100,600000` và `BIGBUY,600000` |

Lý do chọn coupon: chỉ 2 mã fixed còn hạn và tính đúng. `total_amount = 600000` lớn hơn ngưỡng của cả hai (VIP100 300000, BIGBUY 500000) vì backend so `>` chứ không phải `>=`. Backend nhận `total_amount` do client gửi nên dùng số cố định cho dễ kiểm tra `final_amount` (500000 / 550000).

Cấu hình CSV Data Set Config trong JMeter:

| File | Sharing mode | Recycle on EOF | Stop thread on EOF | Lý do |
|---|---|---|---|---|
| `users.csv` | All threads | True | False | 500 dòng ≥ số VU lớn nhất (Stress 500), mỗi VU đọc 1 dòng khác nhau → mỗi VU 1 tài khoản, giỏ hàng không lẫn nhau. Recycle chỉ để không dừng khi VU lặp nhiều vòng. |
| `categories.csv` | All threads | True | False | Chỉ 3 dòng, quay vòng để các VU rải đều qua 3 category |
| `coupons.csv` | All threads | True | False | 2 dòng, quay vòng VIP100/BIGBUY |

Lưu ý về `users.csv`: CSV Data Set Config lấy dòng kế tiếp ở **mỗi vòng lặp**, nên vòng sau một VU có thể nhận tài khoản khác. Việc này không sao vì mỗi vòng đều login lại lấy token mới. Vì 500 dòng ≥ số VU đồng thời và các dòng được chia lần lượt, tại một thời điểm các VU gần như luôn dùng tài khoản khác nhau. Giỏ hàng có lẫn một chút cũng không làm checkout sai (checkout không đọc giỏ). Đã chốt trong test plan Load: `users.csv` để **All threads + Recycle True**. Không dùng `Current thread` vì khi đó mọi VU đọc cùng dòng đầu tiên (chung 1 tài khoản); không dùng Stop thread on EOF vì sau 200 vòng (khoảng 1,5 phút với 30 VU) test sẽ dừng sớm. Recycle an toàn vì mỗi vòng đều login lại bằng mật khẩu đúng, không ảnh hưởng lockout.

## 4. Reset giữa các lượt chạy

`sh scripts/reset-state.sh` (chạy khi JMeter đã dừng): mở khóa mọi user, xóa `orders` và `coupon_usage` của user `quang_u*`, in giờ chạy, login thử `quang_u001`.

Giỏ hàng nằm trong RAM backend, không có API xóa giỏ → chỉ xóa được bằng restart backend, mà restart thì DB bị reseed nên phải chạy lại `node scripts/setup-users.js`. Giỏ cũ không làm checkout lỗi (checkout không đọc giỏ) nhưng làm `GET /api/cart` và bộ nhớ process lớn dần, nên trước lượt chạy chính thức (nhất là soak) sẽ restart backend + chạy lại setup để số liệu RAM sạch.

## 5. Thông số Load

Máy: M2 Pro 10 nhân, 16 GB, backend Node + SQLite và JMeter chạy **cùng một máy** (xem `evidence/hardware/hardware.md`). Chỉ dùng Thread Group có sẵn (chưa cài plugin Custom Thread Groups).

| Thông số | Giá trị | Property JMeter | Lý do |
|---|---|---|---|
| Số VU | **30** | `threads=30` | Nằm giữa khoảng 20–50 gợi ý. Load là tải "bình thường", không phải tìm điểm gãy. Node chạy 1 luồng event loop, SQLite chỉ 1 connection nên mọi lệnh ghi (login `UPDATE`, checkout `INSERT`) xếp hàng tuần tự; 30 VU vẫn để dư chỗ cho Stress tăng tiếp. JMeter 30 thread rất nhẹ so với 16 GB, ít tranh CPU với backend. `users.csv` có 500 tài khoản, dư cho 30 VU. |
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

## 6. Thông số Stress

Mục tiêu: tăng tải từng bậc tới khi hệ thống gãy (lỗi tăng hoặc p95 tăng vọt). Không có plugin Stepping Thread Group nên dựng bằng **10 Thread Group thường**, mỗi nhóm là 1 bậc: cùng số VU, vào trễ dần (startup delay) và **cùng kết thúc** ở giây 600.

| Thread Group | VU | Startup delay | Duration | Ramp | Số VU đang chạy |
|---|---|---|---|---|---|
| Stress bậc 01 | 50 | 0 s | 600 s | 5 s | 50 |
| Stress bậc 02 | 50 | 60 s | 540 s | 5 s | 100 |
| Stress bậc 03 | 50 | 120 s | 480 s | 5 s | 150 |
| ... | ... | ... | ... | ... | ... |
| Stress bậc 10 | 50 | 540 s | 60 s | 5 s | 500 |

Công thức trong plan: bậc `i` (0..9) có delay = `i * step_secs`, duration = `(10 - i) * step_secs`, viết bằng `${__jexl3(...)}` quanh `${__P(step_secs,60)}`.

### Vì sao đổi thông số (sau khi chạy thử full-size)

Bản đầu (+20 VU/60 s, trần 200 VU, think 0,5–1 s) chạy đủ 10 phút **không gãy**: bậc 200 VU chỉ 301,5 req/s, p50 1 ms, p95 3 ms, p99 4 ms, max 56 ms, 0% lỗi, CPU node ~20%, RSS 44 → 79 MB. SUT chỉ mất ~1 ms/request nên gần như toàn bộ thời gian của VU là think-time, 200 VU vẫn là tải nhẹ.

Chạy dò thêm với think 0–100 ms, +20 VU/20 s tới 200 VU: vẫn không gãy, 200 VU đạt 3.994 req/s, p95 3 ms, p99 6 ms, max 156 ms, 0% lỗi, CPU node ~70%, RSS 60 → 113 MB. RPS tăng tuyến tính theo VU (~20 req/s mỗi VU), CPU node ~0,35% mỗi VU → ước lượng node (1 luồng) chạm 100% CPU ở khoảng **280–300 VU**. Đặt trần 500 VU để bậc gãy nằm khoảng giữa lượt chạy (bậc 6, 300 VU) và còn vài bậc phía sau để thấy rõ throughput đứng lại.

| Thông số | Cũ | Mới | Property | Lý do |
|---|---|---|---|---|
| Bước tăng | +20 VU | **+50 VU** | `step_users=50` | +20 VU chỉ thêm ~7% CPU node mỗi bậc, 10 bậc không tới giới hạn. +50 VU ≈ +1.000 req/s, +17% CPU mỗi bậc. |
| Thời gian mỗi bậc | 60 s | 60 s | `step_secs=60` | Giữ nguyên: mỗi VU 1 vòng ~0,4 s nên 60 s đủ nhiều sample để tính p95 từng bậc. |
| Ramp mỗi bậc | 5 s | 5 s | `step_ramp=5` | Giữ nguyên, 10 VU/s, bậc vẫn rõ ràng. |
| Mức trần | 200 VU | **500 VU** (10 bậc) | | Gấp ~1,7 lần mức dự đoán gãy (~300 VU). `users.csv` tăng lên 500 tài khoản (`node scripts/setup-users.js 500`) để mỗi VU vẫn 1 tài khoản riêng. |
| Think-time | 0,5–1 s | **0–100 ms** | `think_min=0`, `think_range=100` (Uniform Random Timer `${__P(think_min,0)}` + `${__P(think_range,100)}`) | Stress cần đẩy SUT tới giới hạn, không mô phỏng người dùng thật. Think dài thì phải cần hàng nghìn VU mới đủ tải. Load vẫn giữ 1–3 s (tải bình thường), Spike giữ 0,5–1 s. |
| Tổng thời gian | 600 s | 600 s = 10 phút | | 10 bậc x 60 s. |

Ước lượng: 1 vòng ≈ 7 x 50 ms think + 8 x ~1 ms ≈ 0,36–0,4 s, 8 request/vòng → ~20 req/s mỗi VU. Nếu không gãy thì 300 VU ≈ 6.000 req/s, 500 VU ≈ 10.000 req/s; thực tế node sẽ bão hòa trước đó.

**Hạn chế:** JMeter chạy cùng máy với backend nên cũng ăn CPU (500 thread, ghi `.jtl` hàng nghìn dòng/giây). Điểm gãy đo được là của "máy này khi chạy cả JMeter lẫn backend", có thể đến sớm hơn so với khi JMeter ở máy riêng. Khi chạy nên mở Activity Monitor (hoặc `top -pid <PID node>`) ghi lại CPU của node và của java để biết bên nào chạm giới hạn trước. RSS node cũng tăng dần vì giỏ hàng nằm trong RAM và không bao giờ được xóa (mục 4), nên tải càng cao bộ nhớ càng phình.

**Cách nhận biết điểm gãy:** trong HTML report xem cùng lúc *Active Threads Over Time*, *Response Time Percentiles Over Time* và *Transactions Per Second*. Điểm gãy là bậc đầu tiên có một trong các dấu hiệu:
- tỉ lệ lỗi > 1% (lỗi tải: 5xx, `Non HTTP response code` timeout/connection refused/reset);
- p95 của bậc tăng vọt so với bậc trước (ví dụ từ vài ms lên hàng chục/hàng trăm ms, hoặc vượt 1 s);
- VU tăng mà throughput không tăng nữa (đường req/s đi ngang, mất quan hệ ~20 req/s mỗi VU): node đã 100% CPU, request chỉ xếp hàng nên response time tăng theo.

Với SUT này dấu hiệu thứ 3 dự kiến xuất hiện trước (throughput đi ngang + p95 tăng), lỗi chỉ xuất hiện khi hàng đợi dài tới mức timeout. Aggregate Report là số tổng cả lượt; số của từng bậc thì lọc `.jtl` theo khoảng 60 s của bậc đó (tính VU, req/s, p50/p95/p99, % lỗi cho từng khoảng).

Nếu tới 500 VU vẫn không có dấu hiệu nào thì ghi là "không gãy trong phạm vi 500 VU" kèm CPU node lúc đó.

Chạy thử nhỏ: `-Jstep_users=10 -Jstep_secs=10` (100 giây, 10 → 100 VU). Kết quả chạy thử: 108.509 sample, 0 lỗi, đủ 8 bước; mỗi 10 s số VU tăng 10 và req/s tăng đều 158 → 2.007 (≈ 20 req/s mỗi VU), p95 2–3 ms; khoảng nghỉ giữa 2 request cùng thread trung vị 48 ms, lớn nhất 117 ms (đúng think 0–100 ms đọc từ property).

## 7. Thông số Spike

Mục tiêu: tải nền thấp, vọt lên đột ngột, giữ ngắn rồi về nền để xem hệ thống có hồi phục (p95 và lỗi về lại mức nền) không. Dựng bằng 2 Thread Group thường chạy song song.

| Thread Group | VU | Startup delay | Duration | Ramp | Ghi chú |
|---|---|---|---|---|---|
| Spike nền | 10 | 0 s | 270 s | 10 s | chạy suốt lượt |
| Spike đỉnh | 150 | 60 s | 95 s | 5 s | vào ở giây 60, đủ 150 VU ở giây 65, dừng ở giây 155 |

Hình dạng tải: 0–60 s: 10 VU → 60–65 s: vọt lên 160 VU → 65–155 s: giữ 160 VU (90 s) → 155–270 s: về 10 VU (115 s hồi phục).

| Thông số | Giá trị | Property | Lý do |
|---|---|---|---|
| Nền | 10 VU | `base_users=10`, `base_ramp=10` | Tải thấp, có sẵn số p95 "bình thường" trong 60 s đầu để so sánh với lúc spike và lúc hồi phục. |
| Đỉnh | +150 VU (tổng 160) | `spike_users=150` | Mức trên của gợi ý 100–150, gấp 16 lần nền nên đủ "sốc". Tổng 160 < 500 tài khoản trong `users.csv`. |
| Ramp spike | 5 s | `spike_ramp=5` | 30 VU/s, đủ đột ngột (khác Stress tăng 20 VU mỗi phút). |
| Thời điểm spike | giây 60 | `spike_delay=60` | Đủ 60 s nền ổn định trước khi spike. |
| Giữ spike | 90 s | `spike_secs=95` (= ramp 5 + giữ 90) | Trong khoảng 1–2 phút gợi ý: đủ thấy hệ thống chịu được hay bắt đầu lỗi, nhưng ngắn để vẫn là spike chứ không thành stress. Hết duration thì 150 VU dừng cùng lúc → tải rơi đột ngột về nền. |
| Hồi phục | 115 s | `total_secs=270` | ≥ 60 s chỉ có nền để xem p95/lỗi có trở về mức của 60 s đầu không. |
| Think-time | 0,5–1 s | Uniform Random Timer 500 + 500 ms | Giữ như bản đầu (Stress đã đổi sang 0–100 ms, xem mục 6). |
| Tổng thời gian | **270 s = 4,5 phút** | | |

Listener: View Results Tree cấu hình **Errors only** (chỉ giữ sample lỗi, không ghi file) để không làm chậm JMeter khi 160 VU. Khi chạy CLI (`-n`) listener GUI không có tác dụng, `.jtl` chính thức lấy từ `-l`; ảnh View Results Tree lấy bằng cách mở `.jtl` trong GUI hoặc chạy GUI tải nhỏ.

Chạy thử nhỏ: `-Jbase_users=2 -Jspike_users=10 -Jspike_delay=20 -Jspike_secs=30 -Jtotal_secs=80` (80 giây).

## 8. Lockout khi chạy Stress/Spike

- Luồng tải chỉ dùng mật khẩu đúng nên không tự khóa tài khoản. Vẫn kiểm tra vì tải cao.
- Plan Stress/Spike có thêm assertion **"Không bị khóa (403 lockout)"** ở bước login, đặt trước `Assert HTTP 200`. Nếu body login có "bị khóa" thì `.jtl` ghi `failureMessage` = `LOCKOUT 403: tài khoản ... bị khóa - lỗi dữ liệu, không phải lỗi tải`. Đã thử khóa `quang_u001`, `quang_u002` bằng SQL rồi chạy: `.jtl` ghi đúng message LOCKOUT.
- Không lấy mã 403 làm dấu hiệu lockout: middleware token (`server.js:106`) cũng trả `403 Forbidden` khi token sai. Một lần login bị khóa sẽ kéo theo 403 Forbidden ở bước 2/6/8 của vòng đó (token `NOT_FOUND`), nên khi đếm lỗi thì nhóm theo message LOCKOUT ở bước 1, các 403 Forbidden cùng vòng là hệ quả, không phải lỗi tải.
- Lỗi tải là: 5xx, `Non HTTP response code` (timeout, connection refused/reset), hoặc request chậm vượt response timeout 30 s.
- Trước mỗi lượt: `bash scripts/reset-state.sh`. Sau mỗi lượt chạy lại script này: dòng `Trước reset - đang khóa: X` cho biết lượt vừa rồi có khóa user nào không (dòng "còn khóa" phía dưới in sau khi mở khóa nên luôn là 0).

## 9. Lệnh chạy chính thức Stress/Spike

```bash
bash scripts/reset-state.sh
jmeter -n -t testplans/20120359_Stress_20261123.jmx -q user.properties \
       -l results/20120359_Stress_20261123.jtl -e -o reports/20120359_Stress_20261123_html
bash scripts/reset-state.sh   # xem dòng "Trước reset - đang khóa"

bash scripts/reset-state.sh
jmeter -n -t testplans/20120359_Spike_20261123.jmx -q user.properties \
       -l results/20120359_Spike_20261123.jtl -e -o reports/20120359_Spike_20261123_html
bash scripts/reset-state.sh
```
