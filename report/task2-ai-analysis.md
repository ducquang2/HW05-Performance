# Task 2 – Phân tích của AI (nguyên văn)

- Công cụ: Claude Code (Claude Opus 5.5)
- Ngày giờ: 2026-11-24 21:14
- Dữ liệu đã đưa vào: 4 file `.jtl` (`results/20120359_{Load,Stress,Spike,Soak}_20261124.jtl`), 4 HTML report (`reports/20120359_<Type>_20261124_html/`, gồm `statistics.json`), 4 test plan `testplans/*.jmx`, CPU/RAM của process node `evidence/<type>/node-usage.csv`, source backend EShop (`HW02/eshop-sut/backend/server.js`, `database.js`).

## Prompt

> Đây là 4 file .jtl và HTML report của các lượt Load, Stress, Spike, Soak cho workflow W2 trên EShop, kèm CSV CPU/RAM của process node. Hãy phân tích kết quả từng lượt: throughput, response time (avg, p90, p95, p99), error rate, điểm gãy của Stress, khả năng hồi phục sau Spike, xu hướng RAM trong Soak. Đề xuất ngưỡng hiệu năng (SLA) cho hệ thống. Sau đó đề xuất các cách tối ưu backend cụ thể (ví dụ index DB, connection pool, SQLite WAL, cache...).

## Output của AI

### 0. Cách tính số liệu

- Workflow W2 gồm 8 request mỗi vòng: login → users/me → categories → products → products/:id → cart → apply-coupon → checkout. Dữ liệu 500 user (`data/users.csv`).
- Các số bên dưới tính trực tiếp từ `.jtl`, **chỉ lấy sample HTTP** (bỏ dòng Transaction Controller có `URL=null`), chia theo cửa sổ thời gian (Stress 30 s = 1 bậc, Spike 10 s, Soak 60 s).
- Lưu ý: cột p90/p95/p99 trong `statistics.json` của HTML report chỉ tính trên 20.000 sample cuối (`jmeter.reportgenerator.statistic_window` mặc định), nên với Stress/Spike/Soak (hàng trăm nghìn – hàng triệu sample) nó không đại diện cho cả lượt. Ví dụ Spike: report ghi Total p95 = 2 ms nhưng tính trên toàn bộ `.jtl` là 8 ms. Load chỉ có 5.916 sample nên hai cách ra cùng số.
- Backend và JMeter chạy chung một máy (MacBook Pro M2 Pro, 16 GB), nên CPU bị chia cho cả hai.

### 1. Tổng quan 4 lượt

| Lượt | Cấu hình tải | Thời gian | Số request | Throughput TB (req/s) | Avg (ms) | p50 | p90 | p95 | p99 | Max (ms) | Error % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Load | 30 VU, ramp 90 s, think 1–3 s/bước | 390 s | 5.916 | 15,2 (ổn định ~17) | 2,28 | 2 | 4 | 5 | 6 | 132 | 0 % |
| Stress | 10 bậc +50 VU mỗi 30 s, tới 500 VU, think 0–100 ms | 300 s | 1.688.031 | 5.626 (đỉnh 9.624) | 2,63 | 2 | 6 | 8 | 13 | 110 | 0 % |
| Spike | nền 50 VU 210 s, +400 VU ở giây 60 trong 65 s | 210 s | 720.805 | 3.434 | 3,19 | 3 | 7 | 8 | 11 | 80 | 0 % |
| Soak | 300 VU, ramp 60 s, giữ 600 s, think 0–100 ms | 660 s | 4.030.538 | 6.107 (ổn định ~6.390) | 1,40 | 1 | 2 | 3 | 5 | 135 | 0 % |

Tất cả response code đều là 200, không có assertion nào fail ở cả 4 lượt.

### 2. Load (30 VU)

| Cửa sổ (s) | VU | req/s | Avg | p90 | p95 | p99 | Max |
|---|---|---|---|---|---|---|---|
| 0–30 | 10 | 3 | 3,41 | 5 | 6 | 15 | 15 |
| 60–90 | 30 | 15 | 3,07 | 4 | 5 | 34 | 132 |
| 90–390 (giữ tải) | 30 | 16–18 | 2,07–2,24 | 4 | 5 | 6 | 6–23 |

Theo endpoint (cả lượt):

| Endpoint | Avg | p90 | p95 | p99 | Max |
|---|---|---|---|---|---|
| POST /api/login | 1,44 | 2 | 3 | 5 | 17 |
| GET /api/users/me | 2,35 | 4 | 4 | 6 | 72 |
| GET /api/categories | 2,13 | 3 | 3 | 6 | 122 |
| GET /api/products | 1,96 | 3 | 3 | 4 | 12 |
| GET /api/products/:id | 1,86 | 3 | 3 | 5 | 15 |
| POST /api/cart | 1,85 | 3 | 3 | 4 | 5 |
| POST /api/apply-coupon | 2,17 | 3 | 4 | 5 | 83 |
| POST /api/checkout | 4,52 | 6 | 6 | 7 | 132 |

Nhận xét:
- Hệ thống rất nhàn ở tải thường: p95 5 ms, 0 lỗi, throughput đi ngang ~17 req/s đúng bằng tải sinh ra (30 VU, think trung bình 2 s/bước).
- Checkout chậm nhất (avg 4,5 ms, gấp ~2 lần các request khác) vì là thao tác ghi `INSERT INTO orders` lên SQLite.
- Max 132 ms chỉ xuất hiện một lần ở cửa sổ 60–90 s (lúc vừa đủ 30 VU), có thể do khởi động/JIT hoặc GC, sau đó không lặp lại.
- CPU node ≤ 5 %, RSS 36 → 49 MB, sau khi dừng còn 19 MB.

### 3. Stress (50 → 500 VU) và điểm gãy

| Bậc | VU | req/s | Tăng so với bậc trước | req/s mỗi VU | Avg | p90 | p95 | p99 | Max | Lỗi |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 50 | 990 | – | 19,8 | 0,75 | 2 | 2 | 3 | 32 | 0 |
| 2 | 100 | 2.085 | +1.095 | 20,9 | 0,81 | 2 | 2 | 3 | 44 | 0 |
| 3 | 150 | 3.165 | +1.080 | 21,1 | 0,84 | 2 | 2 | 3 | 52 | 0 |
| 4 | 200 | 4.251 | +1.086 | 21,3 | 0,88 | 2 | 2 | 3 | 43 | 0 |
| 5 | 250 | 5.299 | +1.048 | 21,2 | 1,02 | 2 | 2 | 4 | 61 | 0 |
| 6 | 300 | 6.358 | +1.059 | 21,2 | 1,13 | 2 | 3 | 4 | 68 | 0 |
| 7 | 350 | 7.221 | +863 | 20,6 | 2,24 | 3 | 5 | 26 | 110 | 0 |
| 8 | 400 | 8.241 | +1.020 | 20,6 | 2,44 | 5 | 6 | 9 | 55 | 0 |
| 9 | 450 | 8.988 | +747 | 20,0 | 3,76 | 7 | 8 | 12 | 61 | 0 |
| 10 | 500 | 9.624 | +636 | 19,2 | 5,84 | 10 | 11 | 16 | 70 | 0 |

CPU/RAM node trong Stress (mẫu mỗi phút): CPU 49 % → 69 % → 97 % → 121 % → 138 %, RSS 107 → 146 → 210 → 218 → 225 MB.

Nhận xét điểm gãy:
- **Không có điểm gãy cứng** trong phạm vi 500 VU: error rate 0 % ở mọi bậc, throughput vẫn còn tăng.
- **Điểm gãy mềm (knee) khoảng 350–400 VU**:
  - Từ 50 đến 300 VU, mỗi bậc +50 VU tăng đều ~+1.050–1.100 req/s, avg ~1 ms, p95 2–3 ms → tuyến tính.
  - Từ 350 VU, avg tăng gấp đôi (1,13 → 2,24 ms), p99 nhảy lên 26 ms, p95 tăng dần 5 → 6 → 8 → 11 ms.
  - Ở 450 và 500 VU, mỗi bậc chỉ còn tăng +747 và +636 req/s (~60–70 % so với giai đoạn tuyến tính), req/s mỗi VU giảm từ 21,2 xuống 19,2.
  - CPU node vượt 100 % (121–138 %) từ khoảng bậc 8 trở đi, tức là process node đã dùng hết 1 core cho JS và phần còn lại là thread pool của sqlite3.
- Kết luận: **năng lực ổn định khoảng 350–400 VU (~7.200–8.200 req/s)**; trên 400 VU hệ thống bắt đầu bão hòa (latency tăng nhanh hơn throughput). Vì think-time chỉ 0–100 ms và latency vẫn nhỏ so với think-time, nếu tăng tiếp VU thì throughput sẽ đi ngang khoảng 10.000 req/s rồi mới bắt đầu có timeout/lỗi.

### 4. Spike (50 → 450 → 50 VU) và khả năng hồi phục

| Giai đoạn | Thời gian (s) | VU | req/s | Avg | p90 | p95 | p99 | Max | Lỗi |
|---|---|---|---|---|---|---|---|---|---|
| Nền trước spike | 10–60 | 50 | ~1.085 | 0,67–0,88 | 1–2 | 2 | 3–4 | 15 | 0 |
| Lúc vào spike | 60–70 | 50 → 450 | 6.404 | 2,84 | 6 | 7 | 11 | 41 | 0 |
| Đỉnh spike | 70–130 | 450 | ~9.010–9.110 | 3,58–4,26 | 7–8 | 8–9 | 10–19 | 80 | 0 |
| 10 s đầu sau spike | 130–140 | 50 | 1.078 | 0,88 | 2 | 2 | 3 | 6 | 0 |
| Hồi phục | 140–210 | 50 | ~1.075–1.095 | 0,83–0,97 | 2 | 2 | 3–4 | 56 | 0 |

CPU/RAM node: trước spike CPU 35 %, RSS 107 MB; trong spike CPU 131 %, RSS 229 MB; giai đoạn hồi phục CPU 39 %, RSS 230 MB; sau khi dừng test RSS 118 MB.

Nhận xét:
- Hệ thống chịu được spike đột ngột gấp 9 lần (50 → 450 VU trong 5 s) mà **không có lỗi**. Throughput tăng theo tải (~1.085 → ~9.050 req/s), p95 tăng từ 2 lên 8–9 ms, p99 cao nhất 19 ms.
- **Hồi phục gần như ngay lập tức**: ngay trong cửa sổ 10 s đầu sau khi spike kết thúc, avg 0,88 ms, p95 2 ms, p99 3 ms, bằng mức trước spike. Không có hàng đợi tồn đọng.
- Riêng RAM không hồi phục ngay: trong giai đoạn hồi phục RSS vẫn ~230 MB (chỉ CPU giảm về 39 %), sau khi test dừng mới xuống 118 MB. Bộ nhớ đã cấp trong spike được giữ lại khá lâu (V8 heap và dữ liệu giỏ hàng trong RAM, xem mục 5).

### 5. Soak (300 VU, 10 phút) và xu hướng RAM

| Phút | VU | req/s | Avg | p90 | p95 | p99 | Max | Lỗi |
|---|---|---|---|---|---|---|---|---|
| 0–1 (ramp) | 0 → 300 | 3.264 | 0,94 | 2 | 2 | 4 | 39 | 0 |
| 1–2 | 300 | 6.404 | 1,38 | 2 | 3 | 5 | 99 | 0 |
| 2–3 | 300 | 6.384 | 1,52 | 3 | 3 | 9 | 96 | 0 |
| 3–4 | 300 | 6.394 | 1,34 | 2 | 3 | 5 | 80 | 0 |
| 4–5 | 300 | 6.402 | 1,42 | 3 | 3 | 5 | 104 | 0 |
| 5–6 | 300 | 6.389 | 1,42 | 2 | 3 | 5 | 103 | 0 |
| 6–7 | 300 | 6.408 | 1,41 | 3 | 3 | 5 | 81 | 0 |
| 7–8 | 300 | 6.395 | 1,40 | 2 | 3 | 5 | 135 | 0 |
| 8–9 | 300 | 6.369 | 1,43 | 2 | 3 | 5 | 116 | 0 |
| 9–10 | 300 | 6.386 | 1,46 | 3 | 3 | 5 | 105 | 0 |
| 10–11 | 300 | 6.374 | 1,46 | 3 | 3 | 6 | 109 | 0 |

RAM/CPU node:

| Thời điểm | Giai đoạn | CPU % | RSS (MB) |
|---|---|---|---|
| 20:56:15 | trước khi chạy | 47,0 | 53,3 |
| 20:57:15 | cuối ramp | 102,9 | 165,3 |
| 20:58:16 | giữ tải | 102,3 | 234,5 |
| 20:59:16 | | 96,6 | 238,0 |
| 21:00:16 | | 99,2 | 241,0 |
| 21:01:16 | | 101,8 | 243,2 |
| 21:02:16 | | 93,6 | 246,3 |
| 21:03:16 | | 95,3 | 249,0 |
| 21:04:16 | | 74,9 | 254,2 |
| 21:05:16 | | 97,5 | 267,2 |
| 21:06:16 | | 78,2 | 274,2 |
| 21:07:16 | cuối test | 82,4 | 274,3 |
| 21:08:16 | đã dừng | 0,0 | 274,3 |
| 21:09:16 | đã dừng | 0,0 | 149,7 |

Nhận xét:
- Hiệu năng **rất ổn định** trong 10 phút: throughput ~6.390 req/s (dao động < 0,6 %), avg 1,34–1,52 ms, p95 luôn 3 ms, p99 5–6 ms (trừ phút 2–3 là 9 ms), 0 lỗi trên ~4 triệu request. Không thấy latency tăng dần theo thời gian.
- Max 80–135 ms xuất hiện rải rác ở mọi phút, nhiều khả năng là các lần GC của V8 hoặc fsync khi ghi SQLite.
- **RAM tăng đều, không đi ngang**: sau khi hết ramp, RSS tăng từ 234,5 MB lên 274,3 MB trong ~9 phút, tức **~4,4 MB/phút**, gần như tuyến tính. Sau khi test dừng 1 phút RSS vẫn 274 MB, 2 phút sau còn 149,7 MB, vẫn cao gần gấp 3 so với lúc đầu (53 MB).
- Nguyên nhân khả nghi nhất trong source: `server.js` lưu giỏ hàng trong biến global `const userCarts = {}`, mỗi `POST /api/cart` thì `push` thêm item vào mảng của user, và **không có chỗ nào xóa giỏ** (kể cả sau checkout). Soak có 503.756 lần add-to-cart → khoảng nửa triệu object `{product_id, quantity, price}` nằm mãi trong RAM, ước tính vài chục MB, khớp với mức tăng ~40 MB và phần RAM không trả lại sau khi dừng. Đây là dấu hiệu **memory leak theo dữ liệu**: chạy càng lâu RAM càng tăng, nếu chạy nhiều giờ thì có thể dẫn đến GC chậm và tràn bộ nhớ.

### 6. Đề xuất ngưỡng hiệu năng (SLA)

SLA đề xuất cho W2 trên cấu hình hiện tại (1 process node + SQLite, máy M2 Pro), lấy từ số đo có chừa biên an toàn:

| Chỉ số | Tải thường (≤ 300 VU, ~6.000 req/s) | Tải đỉnh ngắn (≤ 450 VU, ≤ 2 phút) | Căn cứ đo được |
|---|---|---|---|
| Error rate | < 0,1 % | < 1 % | 0 % ở cả 4 lượt |
| Avg response time | ≤ 5 ms | ≤ 10 ms | Soak 1,4 ms; Spike đỉnh 3,6–4,3 ms |
| p90 | ≤ 8 ms | ≤ 15 ms | Soak 2 ms; Stress 450 VU 7 ms |
| p95 | ≤ 10 ms | ≤ 20 ms | Soak 3 ms; Spike đỉnh 8–9 ms; Stress 500 VU 11 ms |
| p99 | ≤ 25 ms | ≤ 50 ms | Soak 5 ms; Spike đỉnh ≤ 19 ms; Stress 350 VU 26 ms |
| Max | ≤ 200 ms | ≤ 300 ms | Max lớn nhất 135 ms |
| Throughput duy trì | ≥ 6.000 req/s trong ≥ 10 phút | ≥ 8.500 req/s | Soak ~6.390 req/s; Spike đỉnh ~9.050 req/s |
| Số VU khuyến nghị tối đa | 350 VU | 450 VU | Knee của Stress ở 350–400 VU |
| Thời gian hồi phục sau spike | – | p95 về ≤ 1,5 × mức nền trong ≤ 30 s | Đo được < 10 s |
| RAM (RSS node) | ≤ 300 MB, tăng ≤ 1 MB/phút sau ramp | ≤ 300 MB | Soak 274 MB, tăng ~4,4 MB/phút (**chưa đạt**) |

Với tải người dùng thật (giống Load: 30 VU, think 1–3 s), SLA chặt hơn: p95 ≤ 10 ms, checkout p95 ≤ 15 ms, error 0 %.

Hiện tại hệ thống đạt tất cả các ngưỡng trên **trừ tiêu chí RAM tăng trong Soak**.

### 7. Đề xuất tối ưu backend

| # | Nội dung | Lý do (từ số đo / source) | Kỳ vọng cải thiện |
|---|---|---|---|
| O1 | Không để giỏ hàng tăng vô hạn trong RAM: xóa `userCarts[userId]` sau khi checkout thành công, hoặc chuyển giỏ hàng sang bảng `cart_items` trong SQLite. | `userCarts` global chỉ `push` không bao giờ xóa; RSS Soak tăng ~4,4 MB/phút và không trả lại sau khi dừng. | RSS đi ngang trong Soak (tăng < 1 MB/phút), đạt SLA RAM; giảm thời gian GC → giảm các max ~100 ms. |
| O2 | Bật SQLite WAL khi mở DB: `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;` | Mỗi vòng W2 có 2 lệnh ghi (UPDATE users khi login, INSERT orders khi checkout). Chế độ rollback journal mặc định phải fsync mỗi lần ghi và khóa cả file khi ghi, đọc phải chờ. Checkout là request chậm nhất (avg 4,5 ms ở Load). | Checkout/login nhanh hơn rõ (thường giảm 2–5 lần thời gian ghi), p99 ở bậc 400–500 VU giảm, đọc và ghi chạy song song được. |
| O3 | Thêm index: `CREATE UNIQUE INDEX idx_users_email ON users(email)`, `CREATE INDEX idx_orders_user ON orders(user_id)`, `CREATE INDEX idx_coupon_usage ON coupon_usage(coupon_id, user_id)`. | Login `SELECT * FROM users WHERE email = ?` đang quét toàn bảng (500 user); bảng `orders` tăng thêm ~500 nghìn dòng sau Soak nên các query theo `user_id` (my-orders, đếm coupon_usage) sẽ chậm dần. | Login giữ ~O(log n) khi số user tăng; query đơn hàng/coupon không chậm theo số dòng. |
| O4 | Login chỉ chạy `UPDATE users SET login_attempts = 0, locked_until = NULL` khi giá trị hiện tại khác 0/NULL. | Hiện mỗi lần login thành công đều ghi DB dù không có gì thay đổi → thêm 1 lệnh ghi mỗi vòng. | Giảm ~50 % số lệnh ghi của W2, giảm tranh chấp khóa ghi SQLite ở tải cao. |
| O5 | Cache trong RAM cho `GET /api/categories` và `GET /api/products` (dữ liệu nhỏ, gần như không đổi), xóa cache khi admin thêm/sửa/xóa. | 2/8 request của W2 (~25 % tải) chỉ đọc dữ liệu tĩnh nhưng vẫn query DB mỗi lần. | Hai endpoint này gần như không tốn DB, giảm CPU thread pool sqlite3, nâng throughput ở điểm bão hòa. |
| O6 | "Connection pool" cho SQLite: sau khi bật WAL (O2), mở 1 connection riêng cho ghi và vài connection chỉ đọc (hoặc đổi sang `better-sqlite3` + prepared statement). Nếu sau này chuyển sang PostgreSQL/MySQL thì dùng pool thật (vd. `pg.Pool`, max 10–20). | Hiện chỉ có 1 đối tượng `sqlite3.Database` dùng chung cho mọi request; CPU node vượt 100 % ở Stress cho thấy thread pool sqlite3 đang làm việc nhiều. | Đọc song song thật sự trên nhiều core, giảm latency khi > 400 VU. Chỉ có tác dụng rõ khi đã bật WAL. |
| O7 | Chạy nhiều process node bằng `cluster` hoặc PM2 (`pm2 start server.js -i 4`). | Node xử lý JS trên 1 core; CPU node đạt 121–138 % ở 450–500 VU và knee xuất hiện ở 350–400 VU, trong khi máy có 10 core. | Đẩy knee lên cao hơn 500 VU, throughput tối đa tăng gần theo số process (cần làm O1 trước vì giỏ hàng trong RAM không chia sẻ giữa các process, và O2 để nhiều process ghi cùng file SQLite). |
| O8 | Chỉ `SELECT` cột cần thiết thay cho `SELECT *` ở login và `/api/users/me` (không trả `password`, `reset_token`). | Response login/profile trả cả object user, dư dữ liệu (và lộ mật khẩu). | Response nhỏ hơn, serialize JSON nhanh hơn một chút; đồng thời sửa lỗi bảo mật. |

Thứ tự nên làm: O1 → O2 → O4 → O3 → O5, sau đó mới tính O6/O7 nếu cần chịu trên 400 VU. Sau mỗi thay đổi nên chạy lại Stress và Soak cùng cấu hình để so sánh (đặc biệt RSS trong Soak và p95/p99 ở bậc 350–500 VU). Ngoài ra nên chạy JMeter trên máy khác để CPU của JMeter không ảnh hưởng tới số đo của backend.
