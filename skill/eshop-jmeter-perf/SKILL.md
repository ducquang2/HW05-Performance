---
name: eshop-jmeter-perf
description: Kiểm thử hiệu năng một nhóm endpoint backend của EShop bằng JMeter 5.6.3 theo 8 bước (xác minh endpoint bằng curl, CSV + script tạo user, chọn thông số Load/Stress/Spike/Soak, sinh .jmx + smoke, chạy chính thức có theo dõi RAM, phân tích .jtl ra p95/p99/error/RPS theo endpoint và theo thời gian, AI phân tích rồi người review, log issue), có điểm dừng để người review sau mỗi bước. Dùng khi cần đo hiệu năng một workflow / nhóm endpoint mới của EShop trong HW05 hoặc bài tương tự.
---

# Kiểm thử hiệu năng một nhóm endpoint EShop bằng JMeter

## Đầu vào

| Cần có | Ví dụ |
| --- | --- |
| Nhóm endpoint / workflow | W2: login → profile → categories → products → product detail → cart → apply-coupon → checkout |
| Source backend | `eshop-sut/backend/server.js`, `database.js` |
| EShop đang chạy | backend `http://localhost:3000` (`node server.js`) |
| JMeter | 5.6.3, **không plugin** (Stress/Spike dựng bằng nhiều Thread Group thường có delay) |
| Máy đo | Cấu hình đã ghi ở `evidence/hardware/` (CPU, RAM, OS); JMeter chạy chung máy hay máy riêng |

Nếu thiếu một mục, hỏi người dùng trước khi làm.

## Quy tắc chung

- Assertion theo **đặc tả / nội dung** response (`$.id`, `$.token`, message), không chỉ kiểm tra HTTP 200. Mỗi request chỉ 1 JSON Assertion, đặt cuối; kiểm tra phụ dùng Response Assertion dạng Substring.
- Không dùng mật khẩu sai trong luồng tải (lockout). Mỗi VU 1 tài khoản nếu được (`users.csv` All threads + Recycle, số dòng ≥ số VU lớn nhất).
- Think-time đặt bằng **Flow Control Action (Pause 0 ms) có Uniform Random Timer làm con, nằm giữa các Transaction Controller**, không đặt timer bên trong Transaction Controller.
- Đặt tên sampler `NN METHOD /path` (ví dụ `03 GET /api/categories`), Transaction Controller `NN_Ten` (ví dụ `03_Categories`). Script phân tích dựa vào ký tự thứ 3 là dấu cách để tách request khỏi transaction.
- Mọi tham số tải đọc qua `${__P(ten,mac_dinh)}` (threads, rampup, duration, step_users, think_min, think_range, host, port, datadir) để chạy thử nhỏ bằng `-J` mà không sửa file.
- Chạy chính thức bằng CLI: `jmeter -n -t ... -q user.properties -l results/X.jtl -e -o reports/X_html`. Không chạy chính thức bằng GUI.
- Percentile lấy từ `.jtl` bằng `scripts/analyze-jtl.py`, **không** lấy từ `statistics.json` của HTML report.
- Sau mỗi bước, ghi vào `report/AI_Audit_Report.md` một mục "Lần N": thời gian (`date '+%Y-%m-%d %H:%M'`), prompt nguyên văn, output tóm tắt, review để `_(sinh viên điền sau khi review)_`. Chỉ ghi các bước tạo ra nội dung bài làm.
- Commit theo dạng `type(scope): mô tả ngắn` (`test`, `fix`, `docs`, `chore`).

## Các bước

Mỗi bước kết thúc bằng một **điểm dừng**: trình bày kết quả, chờ người dùng duyệt hoặc sửa rồi mới sang bước sau.

### Bước 1 – Xác minh endpoint bằng curl

1. Đọc route trong `server.js` của từng endpoint: method, path, body, có cần token không, response, mã lỗi.
2. Gọi thử từng endpoint bằng `curl` trên app đang chạy, ghi request + response thật (cả case lỗi: sai mật khẩu, id không tồn tại).
3. Ghi vào `notes/sut-endpoints.md`: bảng endpoint, dữ liệu seed cần dùng, và bảng "bất thường ảnh hưởng tới test" (dẫn `server.js:dòng`), ví dụ lockout, id sai trả 200, register không chặn trùng.
4. Viết `notes/workflow-xx.md`: bảng các bước của 1 vòng lặp (endpoint, biến lấy từ CSV / extractor, assertion).

**Điểm dừng:** người dùng duyệt bảng endpoint, assertion của từng bước và danh sách bất thường.

### Bước 2 – CSV và script tạo user / reset

1. Tạo `data/*.csv` (users, categories, coupons...). Đường dẫn trong plan: `${__P(datadir,../data)}/x.csv` (tính theo thư mục chứa `.jmx`).
2. Script tạo user (mẫu `scripts/setup-users.js`): nhận số user từ argv, **login thử trước**, chỉ register khi login 401, cuối cùng login lại toàn bộ để xác nhận.
3. Script reset giữa các lượt (mẫu `scripts/reset-state.sh`): in trạng thái khóa **trước** khi mở khóa, mở khóa, xóa dữ liệu do lượt chạy tạo ra, login thử 1 user.
4. Nếu workflow chỉ gồm endpoint không cần đăng nhập thì bỏ users.csv và script tạo user, ghi rõ lý do.

**Điểm dừng:** người dùng xem output của script tạo user (`login OK N/N`) và reset.

### Bước 3 – Chọn thông số Load / Stress / Spike / Soak

1. Load: tải bình thường (20–50 VU), ramp đủ dài, think 1–3 s. Ghi lý do từng thông số vào bảng trong `notes/workflow-xx.md`.
2. **Chạy dò năng lực trước khi chốt Stress**: chạy ngắn với think ~0–100 ms, tăng VU vài bậc, đo req/s mỗi VU và CPU `node` mỗi VU, từ đó ước lượng mức VU làm node chạm 100% CPU. Đặt trần Stress cao hơn mức đó để điểm gãy nằm giữa lượt chạy. (Bài W2: think 0,5–1 s tới 200 VU không gãy, chỉ 301 req/s; think 0–100 ms gãy ở ~400–450 VU.)
3. Ước lượng dung lượng `.jtl` = req/s × thời gian × ~150 byte; giữ bậc ngắn (30 s) nếu vượt vài trăm MB.
4. Spike: nền thấp + đỉnh **vượt** ngưỡng Stress, ramp vài giây, có đoạn hồi phục sau đỉnh. Soak: ~75% ngưỡng, ≥ 10 phút.

**Điểm dừng:** người dùng chốt bảng thông số và số liệu chạy dò.

### Bước 4 – Sinh .jmx và chạy thử nhỏ

1. Sinh `testplans/{MSSV}_{Type}_{YYYYMMDD}.jmx` cho từng loại. Có thể viết script Python tạm sinh XML (để ngoài repo). Cấu trúc: HTTP Request Defaults (host/port qua `__P`), Header JSON, CSV Data Set, Thread Group → mỗi bước 1 Transaction Controller chứa 1 HTTP Request (+ assertion, extractor, header Authorization) → Flow Control Action think-time giữa các bước.
2. Stress: N Thread Group, Thread Group thứ i có delay `${__jexl3(i*${__P(step_secs,30)})}`. Spike: 2 Thread Group (nền + đỉnh). Mỗi plan Load/Stress/Spike 1 listener khác nhau (Summary Report, Aggregate Report, View Results Tree – Errors only).
3. Smoke nhỏ, ví dụ `-Jthreads=5 -Jrampup=10 -Jduration=60`, rồi kiểm tra trên `.jtl`: 0 lỗi, đủ mọi bước, số sample transaction = số sample request (không có sample 0 ms), số thread đúng hình dạng tải.
4. **Thử assertion có bắt lỗi không**: cố ý làm sai 1 điều kiện, chạy lại, xem cột `failureMessage` trong `.jtl` có message đúng.
5. Ghi lỗi tìm được vào `notes/review-testplans.md` (Plan / AI sai gì / Sửa thế nào / Vì sao). Commit `test(load): thêm test plan ...`.

**Điểm dừng:** người dùng xem kết quả smoke và chạy checklist review bên dưới.

### Bước 5 – Chạy chính thức, theo dõi RAM

1. Thứ tự mỗi lượt: `bash scripts/reset-state.sh` → `bash scripts/monitor-node.sh evidence/<type>/node-usage.csv &` → `jmeter -n -t testplans/X.jmx -q user.properties -l results/X.jtl -e -o reports/X_html` → `bash scripts/reset-state.sh` (đọc dòng "Trước reset - đang khóa").
2. Trước Soak: restart backend + `node scripts/setup-users.js` để RAM đầu sạch; ghi RSS lúc chưa có tải.
3. Quay màn hình / chụp ảnh **cửa sổ JMeter cạnh Activity Monitor (hoặc htop)** trong lúc chạy, lưu `evidence/<type>/`.
4. `-e -o` cần thư mục report chưa tồn tại; chạy lại thì xóa thư mục cũ.

**Điểm dừng:** người dùng xác nhận đủ 4 file `.jtl`, 4 HTML report, 4 `node-usage.csv`, ảnh bằng chứng, không có user bị khóa.

### Bước 6 – Phân tích .jtl

1. Tổng và theo endpoint: `python3 skill/eshop-jmeter-perf/scripts/analyze-jtl.py [--skip <giây ramp>] results/*.jtl` → n, rps, avg, p50/p90/p95/p99, max, error% từng endpoint.
2. Theo thời gian: `python3 skill/eshop-jmeter-perf/scripts/jtl-windows.py [--skip N] results/X.jtl <bucket>`. Stress dùng bucket = `step_secs` để có bảng theo bậc, rồi bucket 5–10 s để kiểm tra một bậc lạ có phải đợt chậm ngắn hay không. Spike dùng 5 s để xem hồi phục.
3. RAM / CPU: đọc `evidence/<type>/node-usage.csv`, tính RSS đầu → cuối, đỉnh, MB/phút sau ramp.
4. Lập bảng Stress theo bậc (VU, req/s, p50, p95, p99, lỗi, CPU node) và chốt điểm gãy theo: req/s đi ngang khi VU tăng, p50/p95 tăng ở ≥ 2 bậc liên tiếp, lỗi xuất hiện.

**Điểm dừng:** người dùng duyệt bảng số liệu trước khi đưa cho AI phân tích.

### Bước 7 – AI phân tích, người review

1. Đưa `.jtl` (hoặc output của 2 script) + HTML report + `node-usage.csv` cho AI, yêu cầu: throughput, response time, error, điểm gãy, hồi phục Spike, xu hướng RAM Soak, SLA, đề xuất tối ưu. Lưu nguyên văn `report/task2-ai-analysis.md`.
2. Người đối chiếu **từng con số** của AI với output script ở Bước 6; số nào AI suy ra từ tổng cả bậc thì kiểm lại bằng cửa sổ 5–10 s.
3. Với mỗi đề xuất tối ưu, mở source (`server.js`, `database.js`, `package.json`) để phân loại: khả thi / không khả thi với code hiện tại / bịa (hallucinated), có dẫn dòng code.
4. Ghi vào `report/task2-review.md`: bảng "AI nói gì / Số thật từ .jtl / Nhận xét" và bảng đề xuất.

**Điểm dừng:** người dùng duyệt bảng review.

### Bước 8 – Log issue

1. Gom bug hiệu năng (RAM tăng, bão hòa) và bug chức năng / bảo mật thấy trong lúc làm. Tìm issue đã có trên repo SUT trước, không log trùng.
2. Mỗi issue: tiêu đề, bước tái hiện, số liệu (từ `.jtl`, `node-usage.csv`), dòng code, mức độ. Ghi bảng vào `report/bugs.md`, chụp trang Issues vào `evidence/issues/`.

**Điểm dừng:** người dùng duyệt nội dung issue trước khi đăng.

## Bẫy đã gặp

| Bẫy | Biểu hiện | Cách xử lý |
| --- | --- | --- |
| Timer đặt trong Transaction Controller | Hết duration khi thread đang "nghĩ" → transaction ghi sample **0 ms, success**, số transaction ≠ số request | Think-time bằng Flow Control Action giữa các Transaction Controller |
| 2 JSON Assertion trên 1 request | Request fail nhưng `failureMessage` rỗng (CSV chỉ lấy message khác null đầu tiên, JSON Assertion đạt vẫn gán `""`) | 1 JSON Assertion đặt cuối, kiểm tra phụ dùng Response Assertion Substring; thử cố ý làm sai |
| SUT chỉ ~1 ms/request | Stress think 0,5–1 s tới 200 VU không gãy (301 req/s, CPU node ~20%) | Chạy dò năng lực trước; Stress think ~0–100 ms, VU cao (tới 500) |
| `.jtl` khổng lồ | Stress 60 s/bậc tới 500 VU ra 903 MB, vượt giới hạn GitHub | Bậc 30 s; `results/*.jtl` và `reports/` vào `.gitignore`, nộp trong zip |
| `statistics.json` lệch | Percentile chỉ tính trên 20.000 sample cuối (`statistic_window`): Spike p95 report 2 ms, thật 8 ms | Lấy percentile từ `.jtl` bằng `analyze-jtl.py` |
| Đợt GC ~10 s | Tổng cả bậc 350 VU có p99 26 ms → AI kết luận điểm gãy 350 VU, thật ra chỉ 10 s chậm | Xem cửa sổ 5–10 s bằng `jtl-windows.py`; điểm gãy cần ≥ 2 bậc liên tiếp |
| Lockout | Sai mật khẩu cộng 2 lần đếm, khóa 3 phút (`server.js:54,57`) | Không dùng mật khẩu sai; assertion phân biệt 403 lockout; `reset-state.sh` trước/sau mỗi lượt |
| Dòng "còn khóa" của reset luôn 0 | In sau khi đã `UPDATE` mở khóa | In trạng thái "Trước reset - đang khóa" trước khi mở |
| Restart backend reseed DB | `database.js` `DROP TABLE` khi khởi động → mất user test | Chạy lại `node scripts/setup-users.js` sau mỗi lần restart |
| `/api/register` không chặn email trùng | Chạy script tạo user 2 lần ra user trùng | Login thử trước, chỉ register khi 401 |
| `/api/products/:id` id sai trả `200 {}` | Assertion chỉ kiểm tra 200 luôn đạt | Assert `$.id == ${product_id}` |
| Giỏ hàng trong RAM (`userCarts`) | RSS node tăng liên tục (Soak ~4,4 MB/phút), không trả RAM | Theo dõi RSS bằng `monitor-node.sh`; restart trước Soak |
| JMeter chạy chung máy | java ăn 30–40% CPU, điểm gãy là của "máy chạy cả hai" | Ghi CPU cả node và java; nêu hạn chế trong report |
| Mẫu RAM đầu tiên của monitor | Dòng đầu đã có tải (CPU 47%), AI coi là mức nền | Ghi RSS lúc chưa tải trước khi bật JMeter; đọc cột CPU để biết tải đã chạy chưa |
| CSV relative path | Tưởng tính theo thư mục đang đứng | JMeter tính theo thư mục chứa `.jmx` → `../data` |
| Gợi ý chung làm thông số luôn | Spike 160 VU think 0,5–1 s chỉ ~3% ngưỡng, không tạo áp lực | Lấy thông số từ số liệu chạy dò / Stress của chính máy |
| Đề xuất tối ưu bịa / không khả thi | AI đề xuất `better-sqlite3` "đọc song song nhiều core" (thư viện đồng bộ) và `cluster`/PM2 (mỗi worker khởi động `DROP TABLE` xóa DB) | Mở source kiểm từng đề xuất trước khi đưa vào report |

Khi làm nhóm endpoint mới, bẫy mới gặp được thêm vào bảng này.

## Checklist review của người

Dùng sau Bước 4 (từng plan) và trước khi chạy chính thức.

| | Mục kiểm tra |
| --- | --- |
| ☐ | Mỗi request có assertion theo nội dung/đặc tả, không chỉ HTTP 200; đã thử cố ý làm sai và `failureMessage` có message |
| ☐ | Không có mật khẩu sai trong luồng tải; plan Stress/Spike/Soak có assertion bắt 403 lockout; chạy reset trước/sau |
| ☐ | CSV: đường dẫn `${__P(datadir,../data)}`, All threads + Recycle, số tài khoản ≥ số VU lớn nhất, mọi tài khoản login được |
| ☐ | Think-time khác 0 với Load, nằm giữa các Transaction Controller; số sample transaction = số sample request |
| ☐ | Có extractor + header `Authorization` ở các bước cần token |
| ☐ | Tham số tải đọc qua `__P`, smoke bằng `-J` chạy được |
| ☐ | Load/Stress/Spike mỗi plan 1 listener khác nhau |
| ☐ | View Results Tree tắt hoặc chỉ Errors only khi tải cao |
| ☐ | Tên file `{MSSV}_{Type}_{YYYYMMDD}` cho `.jmx`, `.jtl`, report |
| ☐ | Số liệu trong report lấy từ `.jtl` (output script), không lấy từ `statistics.json` |
| ☐ | Có bằng chứng tài nguyên: `node-usage.csv` + ảnh JMeter cạnh Activity Monitor |

## Ví dụ output script

Chạy trên `results/20120359_Load_20261124.jtl` (Load W2, 30 VU, 390 s, ramp 90 s).

`python3 skill/eshop-jmeter-perf/scripts/analyze-jtl.py --skip 90 results/20120359_Load_20261124.jtl`

```
== 20120359_Load_20261124.jtl skip=90s req=5123 tx=5123 dur=300s rps=17.1 avg=2.17 p50=2 p90=4 p95=5 p99=6 max=23 err=0 (0.00%) avgLat=2.16 | tx avg=2.17 p95=5
   01 POST /api/login           n=638 rps=2.1 avg=1.36 p95=2 p99=3 max=17 err=0.00%
   02 GET /api/users/me         n=640 rps=2.1 avg=2.26 p95=4 p99=5 max=7 err=0.00%
   03 GET /api/categories       n=642 rps=2.1 avg=1.88 p95=3 p99=5 max=8 err=0.00%
   04 GET /api/products         n=643 rps=2.1 avg=1.89 p95=3 p99=4 max=7 err=0.00%
   05 GET /api/products/:id     n=644 rps=2.1 avg=1.79 p95=3 p99=4 max=6 err=0.00%
   06 POST /api/cart            n=640 rps=2.1 avg=1.82 p95=3 p99=4 max=5 err=0.00%
   07 POST /api/apply-coupon    n=638 rps=2.1 avg=2.04 p95=3 p99=5 max=6 err=0.00%
   08 POST /api/checkout        n=638 rps=2.1 avg=4.37 p95=6 p99=7 max=23 err=0.00%
```

Không có `--skip` (tính cả ramp): rps 15,2, max 132 ms. Số tổng của ramp kéo rps xuống và đẩy max lên.

`python3 skill/eshop-jmeter-perf/scripts/jtl-windows.py --skip 60 results/20120359_Load_20261124.jtl 30`

```
bucket  thr  rps    p50  p95  p99  max  err%
   60s   30   14.8    2    5   34  132  0.00
   90s   30   16.4    2    5    6    7  0.00
  120s   30   16.9    2    5    6    6  0.00
  ...
  360s   30   17.0    2    5    6    7  0.00
```

## Định dạng đầu ra

| File | Nội dung |
| --- | --- |
| `notes/sut-endpoints.md`, `notes/workflow-xx.md` | Endpoint đã xác minh bằng curl, bảng bước, thông số và lý do |
| `data/*.csv`, `scripts/setup-users.js`, `scripts/reset-state.sh` | Dữ liệu test, tạo user, reset giữa các lượt |
| `testplans/{MSSV}_{Type}_{YYYYMMDD}.jmx` | 4 plan Load/Stress/Spike/Soak |
| `notes/review-testplans.md` | Lỗi của plan do AI sinh, cách sửa |
| `results/*.jtl`, `reports/*_html` | Kết quả thô và HTML report (không commit, nộp trong zip) |
| `evidence/<type>/node-usage.csv`, ảnh | CPU/RAM node, ảnh JMeter cạnh resource monitor |
| `report/task2-ai-analysis.md`, `report/task2-review.md` | Phân tích của AI và bản review của người |
| `report/bugs.md` | Danh sách issue đã log |
| `report/AI_Audit_Report.md` | Mỗi bước một "Lần N" |
