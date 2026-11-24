# Task 2 – Review phân tích của AI

Phân tích gốc của AI: `report/task2-ai-analysis.md`.

## Cách lấy số đúng

Em tự tính lại các số dưới đây từ file `.jtl` gốc trong `results/`. Em chỉ lấy request HTTP, có label dạng `01 POST /api/login`, và bỏ dòng Transaction Controller. Percentile tính trên toàn bộ sample của lượt chạy. Script tính toán: `scripts/analyze-jtl.py`.

| Lượt | Request | Thời gian | req/s TB | Avg | p90 | p95 | p99 | Max | Lỗi |
|---|---|---|---|---|---|---|---|---|---|
| Load | 5.916 | 390 s | 15,2 | 2,28 | 4 | 5 | 6 | 132 | 0 |
| Stress | 1.688.031 | 300 s | 5.625,9 | 2,63 | 6 | 8 | 13 | 110 | 0 |
| Spike | 720.805 | 210 s | 3.433,9 | 3,19 | 7 | 8 | 11 | 80 | 0 |
| Soak | 4.030.538 | 660 s | 6.106,9 | 1,40 | 2 | 3 | 5 | 135 | 0 |

AI ghi đúng các số tổng ở trên. AI cũng chỉ ra đúng một điểm em suýt bỏ qua: percentile trong `statistics.json` của HTML report chỉ tính trên cửa sổ 20.000 sample (`jmeter.reportgenerator.statistic_window`), nên lệch so với tính trên toàn bộ file:

| Lượt | p95 trong report | p95 tính trên toàn bộ `.jtl` | p99 trong report | p99 tính trên toàn bộ `.jtl` |
|---|---|---|---|---|
| Stress | 13 | 8 | 18 | 13 |
| Spike | 2 | 8 | 4 | 11 |
| Soak | 4 | 3 | 17 | 5 |

Vì vậy, khi viết report em lấy percentile từ `.jtl`, không lấy từ bảng Statistics của HTML report.

## Những chỗ AI đọc sai hoặc suy diễn quá dữ liệu

| # | AI nói | Giá trị đúng trong `.jtl` | Lỗi nằm ở đâu |
|---|---|---|---|
| 1 | Stress: "điểm gãy mềm khoảng 350–400 VU", vì ở bậc 350 VU avg tăng gấp đôi (1,13 → 2,24 ms) và p99 nhảy lên 26 ms | Chia bậc 350 VU thành cửa sổ 5 s thì chỉ 10 giây (190–200 s) có p95 17 ms, p99 65 ms, max 110 ms. Các cửa sổ còn lại p95 3–4 ms. Bậc 400 VU trở lại bình thường: p95 5–7 ms, p99 7–9 ms, throughput vẫn tăng +1.020 req/s. p50 chỉ tăng thật từ bậc 450 VU (3–4 ms) và 500 VU (5–6 ms); hai bậc này cũng có throughput tăng chậm lại (+747, +636) | AI lấy một đợt chậm ngắn 10 s, có thể do GC, làm bằng chứng cho điểm gãy. Đó là lỗi đọc số tổng của cả bậc mà không xem phân bố theo thời gian. Bão hòa thật bắt đầu ở 400–450 VU. |
| 2 | Load: "Max 132 ms chỉ xuất hiện một lần ở cửa sổ 60–90 s" | Có 4 request trên 50 ms, rơi vào 4 endpoint khác nhau: users/me 72 ms, checkout 132 ms, categories 122 ms, apply-coupon 83 ms | AI chỉ nhìn cột Max nên tưởng là một điểm lẻ duy nhất. Thực tế đây là một đợt chậm ngắn ảnh hưởng nhiều request cùng lúc. |
| 3 | O2: chọn bật WAL vì "checkout là request chậm nhất (avg 4,5 ms ở Load)", và kỳ vọng "thường giảm 2–5 lần thời gian ghi" | Checkout chỉ chậm nhất ở Load, khi ít request nên chi phí cố định của mỗi lần ghi lộ rõ. Ở Soak, checkout avg 1,84 ms so với các request đọc 1,43–1,57 ms. Ở Stress 3,11 ms so với 2,70–2,87 ms. Ghi DB không phải nút cổ chai khi tải cao. | AI lấy kết luận ở tải thấp áp cho tải cao. Con số "2–5 lần" không có trong dữ liệu, là số AI tự đưa ra. |
| 4 | Stress: "nếu tăng tiếp VU thì throughput sẽ đi ngang khoảng 10.000 req/s rồi mới bắt đầu có timeout/lỗi" | Không có lượt chạy nào vượt 500 VU. Ở bậc 500 VU, throughput 9.500–9.750 req/s và 0 lỗi. | Đây là ngoại suy, không phải số đo. Report của em chỉ kết luận "không gãy cứng đến 500 VU". |
| 5 | SLA: cột "Tải thường (≤ 300 VU)" nhưng dòng "Số VU khuyến nghị tối đa" lại là 350 VU | Soak chỉ kiểm chứng 300 VU trong 10 phút. Mức 350 VU chưa chạy bền lần nào. | Bảng tự mâu thuẫn. Em chốt ngưỡng endurance là 300 VU, khoảng 6.390 req/s. |
| 6 | Soak: RAM "vẫn cao gần gấp 3 so với lúc đầu (53 MB)" | Dòng 20:56:15 ghi CPU 47%, tức JMeter đã bắt đầu chạy. Backend vừa restart và chưa có tải thì RSS khoảng 18–28 MB, theo dòng đầu file monitor của Load và Stress. | AI coi mẫu đầu tiên trong file là mức nền của RAM, nhưng lúc đó tải đã chạy. Mức tăng thực tế còn lớn hơn AI tính. |

## Đánh giá các đề xuất tối ưu

| # | Đề xuất | Kết luận | Lý do, dựa vào source SUT |
|---|---|---|---|
| O1 | Xóa `userCarts[userId]` sau checkout, hoặc chuyển giỏ hàng vào DB | **Khả thi** | `server.js` khai báo `const userCarts = {}` ở dòng 14. `POST /api/cart` (dòng 290–295) chỉ thêm vào giỏ, còn checkout (dòng 297–309) không đụng tới giỏ. Thêm một dòng xóa giỏ sau `INSERT` là sửa được rò rỉ RAM thấy trong Soak. |
| O2 | Bật WAL (`PRAGMA journal_mode=WAL`) | **Khả thi nhưng ít tác dụng** | SUT dùng `sqlite3` với file `database.sqlite`, PRAGMA chạy được. Tuy vậy, theo lỗi #3 ở trên, ghi DB không phải nút cổ chai, và mức cải thiện "2–5 lần" là số không có căn cứ. |
| O3 | Index `users(email)` UNIQUE, `orders(user_id)`, `coupon_usage(coupon_id, user_id)` | **Khả thi một phần, không liên quan W2** | Bảng `users` chỉ có khoảng 500 dòng nên quét cả bảng không đáng kể. Index UNIQUE sẽ lỗi nếu DB đã có email trùng, vì `/api/register` không chặn email trùng. W2 cũng không gọi `my-orders`, và `apply-coupon` không gửi `user_id` nên không đọc `coupon_usage`. Hai index sau không ảnh hưởng số đo của bài. |
| O4 | Login chỉ chạy `UPDATE` reset lockout khi cần | **Khả thi** | `server.js` dòng 47–50 luôn chạy `UPDATE users SET login_attempts = 0 …` mỗi lần login đúng. Thêm điều kiện `if (user.login_attempts || user.locked_until)` là bỏ được 1 trong 2 lệnh ghi của mỗi vòng. |
| O5 | Cache categories và products trong RAM | **Khả thi** | Dữ liệu nhỏ, gồm 3 danh mục và 5 sản phẩm. Phải xóa cache ở các route admin `POST/PUT/DELETE /api/products` (dòng 167–197) và `/api/categories` (dòng 249–281). |
| O6 | "Connection pool" cho SQLite, hoặc chuyển sang `better-sqlite3` để "đọc song song thật sự trên nhiều core" | **Hallucinated** | `sqlite3` (node-sqlite3) không có connection pool. `better-sqlite3` là thư viện **đồng bộ**: mọi truy vấn chạy trên luồng chính của Node, nên không thể đọc song song trên nhiều core. AI cũng nói "CPU > 100% cho thấy thread pool sqlite3 làm việc nhiều" nhưng không có số đo nào chứng minh, vì phần trên 100% có thể là GC hoặc libuv. |
| O7 | Chạy nhiều process bằng `cluster` hoặc PM2 | **Không khả thi nếu giữ code hiện tại** | `database.js` gọi `initDatabase()` ở dòng 117, hàm này `DROP TABLE` rồi seed lại ngay khi process khởi động. Mỗi worker khởi động sẽ xóa sạch DB của các worker khác. AI chỉ nhắc tới vấn đề giỏ hàng trong RAM mà bỏ sót điểm này. |
| O8 | Không `SELECT *`, không trả `password` | **Khả thi** | Login (dòng 52) và `/api/users/me` (dòng 114) trả cả object user, gồm `password` plaintext. Đây chủ yếu là lỗi bảo mật; về hiệu năng thì response chỉ nhỏ đi vài chục byte, gần như không đổi. |

## Kết luận sau review

- **Ngưỡng endurance:** 300 VU, khoảng 6.390 req/s, p95 3 ms, 0 lỗi trong 10 phút. RAM của `node` tăng khoảng 4,4 MB/phút sau ramp và lên tới 274 MB.
- **Stress:** không gãy cứng đến 500 VU (9.617 req/s, 0 lỗi). Bão hòa bắt đầu ở 400–450 VU: p50 tăng, throughput tăng chậm lại, CPU `node` vượt 100%. Lý do AI đưa ra cho mốc 350 VU là sai (xem lỗi #1).
- **Đề xuất nên làm trước:** O1 vì sửa đúng lỗi rò rỉ RAM, sau đó O4. O6 và O7 là hallucinated hoặc không làm được với code hiện tại.
