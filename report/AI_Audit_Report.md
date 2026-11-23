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

### Lần 3 – Bước 2: chọn thông số Load cho W2

- Tên AI tool: Claude Code (Claude Opus 5.5)
- Ngày giờ: 2026-11-23 22:13
- Mục đích: Chọn số VU, ramp-up, thời gian giữ tải và think-time cho test Load, phù hợp với máy chạy chung backend và JMeter.
- Prompt của tôi:
  > Với máy M2 Pro 16GB chạy cả backend Node + SQLite lẫn JMeter, đề xuất thông số Load test cho workflow W2: số VU, ramp-up, thời gian giữ tải, think-time. Giải thích từng con số, chỉ dùng Thread Group có sẵn vì chưa cài plugin.
- Output của AI (tóm tắt):
  - Mục "5. Thông số Load" trong `notes/workflow-w2.md`: 30 VU, ramp-up 90 giây (3 giây/VU), giữ tải 5 phút, think-time 1–3 giây (Uniform Random Timer 1000 + 2000 ms) trước mỗi bước 2–8, lặp vô hạn dừng theo Duration.
  - Lý do: Node 1 luồng + SQLite 1 connection nên lệnh ghi xếp hàng, 30 VU là tải bình thường và chừa chỗ cho Stress; ramp chậm để login (có ghi DB) không dồn cùng lúc; 5 phút đủ sample, dài hơn để dành cho soak.
  - Vì Thread Group thường chỉ có 1 ô Duration nên đặt `duration = 90 + 300 = 390` giây. Ước lượng ~14 giây/vòng, ~17 request/giây.
- Tôi đã review / sửa gì: _(sinh viên điền sau khi review)_

### Lần 4 – Bước 2: sinh test plan Load `20120359_Load_20261123.jmx`

- Tên AI tool: Claude Code (Claude Opus 5.5)
- Ngày giờ: 2026-11-23 22:25
- Mục đích: Sinh file test plan Load cho W2 theo cấu trúc mục 2.1, chạy thử với tải nhỏ và sửa đến khi chạy thông.
- Prompt của tôi:
  > Sinh file JMeter 20120359_Load_20261123.jmx cho workflow W2 theo cấu trúc: User Defined Variables, HTTP Request Defaults, Header Manager JSON, CSV Data Set Config cho users/categories/coupons, Transaction Controller cho từng bước, JSON Extractor token/product_id/final_amount, Authorization header, assertion status code và nội dung, Uniform Random Timer giữa các bước, listener Summary Report. Thông số tải đọc từ property để chạy thử nhỏ được. Chạy thử ngắn và sửa đến khi chạy thông.
- Output của AI (tóm tắt):
  - `testplans/20120359_Load_20261123.jmx`: UDV `HOST/PORT/PROTOCOL`, HTTP Request Defaults, Header `Content-Type: application/json`, 3 CSV Data Set Config (`${__P(datadir,../data)}`, All threads, recycle true), Thread Group `${__P(threads,30)}` / `${__P(rampup,90)}` / `${__P(duration,390)}` lặp vô hạn, 8 Transaction Controller `01_Login`..`08_Checkout`, JSON Extractor `token`, `product_id` (`$[?(@.category_id == ${category_id})].id`, match ngẫu nhiên), `price`, `final_amount`, `coupon_id`, header `Authorization: Bearer ${token}` ở bước 2, 6, 8, mỗi bước có assertion status 200 + nội dung, think-time 1–3 s giữa các bước, Summary Report (không ghi file).
  - `user.properties` ở root repo: `.jtl` dạng CSV, không lưu response data, có failure message, latency, connect time, thread counts, bytes, sent bytes, URL.
  - Chạy thử `-Jthreads=5 -Jrampup=10 -Jduration=60`: 155 request, 0 lỗi, đủ 8 bước. Tự thử trường hợp sai (filter category `!=`, id sản phẩm không tồn tại) để chắc assertion bắt được lỗi.
  - Lỗi của bản đầu đã sửa (ghi chi tiết ở `notes/review-testplans.md`): timer nằm trong Transaction Controller làm sinh sample transaction 0 ms khi hết giờ; 2 JSON Assertion trên cùng request làm mất failure message trong `.jtl`.
- Tôi đã review / sửa gì: _(sinh viên điền sau khi review)_

### Lần 5 – Bước 2: sinh test plan Stress `20120359_Stress_20261123.jmx`

- Tên AI tool: Claude Code (Claude Opus 5.5)
- Ngày giờ: 2026-11-23 22:50
- Mục đích: Sinh test plan Stress tìm điểm gãy cho W2 bằng Thread Group có sẵn, tránh khóa tài khoản và tách lỗi lockout khỏi lỗi tải.
- Prompt của tôi:
  > Dựa trên plan Load W2 đã chạy thông (5 VU p95 dưới 10 ms), sinh 20120359_Stress_20261123.jmx để tìm điểm gãy: tăng bậc VU đều theo thời gian chỉ bằng Thread Group có sẵn, think-time ngắn hơn Load, listener Aggregate Report. Giải thích bậc tăng, mức trần và cách nhận biết điểm gãy. Lưu ý tránh làm khóa tài khoản và phân biệt lỗi 403 lockout với lỗi tải.
- Output của AI (tóm tắt):
  - `testplans/20120359_Stress_20261123.jmx`: giữ nguyên 8 bước, extractor, header và assertion của plan Load; 10 Thread Group "Stress bậc 01..10", mỗi nhóm `${__P(step_users,20)}` VU, ramp `${__P(step_ramp,5)}` s, delay `i*step_secs`, duration `(10-i)*step_secs` (`step_secs=60`) để mọi bậc cùng kết thúc ở giây 600; think-time 0,5–1 s; listener Aggregate Report.
  - Mục "6. Thông số Stress" trong `notes/workflow-w2.md`: +20 VU mỗi 60 s, trần 200 VU vì `users.csv` chỉ có 200 tài khoản, tổng 10 phút; điểm gãy là bậc đầu tiên có lỗi > 1%, p95 tăng vọt, hoặc throughput không tăng theo VU.
  - Lockout: thêm assertion "Không bị khóa (403 lockout)" ở bước login (ghi message `LOCKOUT 403 ...`), ghi chú 403 Forbidden ở bước có token là do token sai chứ không phải lockout (mục 8). Thêm dòng in số user đang khóa **trước** khi mở khóa vào `scripts/reset-state.sh` (dòng cũ in sau khi mở khóa nên luôn 0).
  - Chạy thử `-Jstep_users=2 -Jstep_secs=10 -Jstep_ramp=2`: 1637 request trong 100 s, 0 lỗi, đủ 8 bước, số thread tăng 2 → 20 theo bậc. Thử khóa 2 user bằng SQL: `.jtl` ghi đúng message LOCKOUT.
- Tôi đã review / sửa gì: _(sinh viên điền sau khi review)_

### Lần 6 – Bước 2: sinh test plan Spike `20120359_Spike_20261123.jmx`

- Tên AI tool: Claude Code (Claude Opus 5.5)
- Ngày giờ: 2026-11-23 22:50
- Mục đích: Sinh test plan Spike cho W2: tải nền, tăng đột ngột, giữ ngắn, về nền để xem hồi phục.
- Prompt của tôi:
  > Sinh 20120359_Spike_20261123.jmx cho W2: tải nền thấp, vọt lên đột ngột trong vài giây, giữ ngắn rồi trở về nền để xem hệ thống hồi phục. Listener View Results Tree chỉ ghi lỗi. Giải thích vì sao chọn các mức và thời gian đó.
- Output của AI (tóm tắt):
  - `testplans/20120359_Spike_20261123.jmx`: cùng 8 bước và assertion lockout như Stress; Thread Group "Spike nền" 10 VU suốt 270 s; "Spike đỉnh" 150 VU, delay 60 s, ramp 5 s, duration 95 s; think-time 0,5–1 s; listener View Results Tree Errors only, không ghi file (chạy CLI thì listener GUI không tác dụng, `.jtl` lấy từ `-l`).
  - Mục "7. Thông số Spike" trong `notes/workflow-w2.md`: 60 s nền → vọt lên 160 VU trong 5 s → giữ 90 s → 115 s chỉ có nền để xem hồi phục, tổng 4,5 phút; 160 < 200 tài khoản.
  - Chạy thử `-Jbase_users=2 -Jspike_users=10 -Jspike_delay=20 -Jspike_secs=30 -Jtotal_secs=80`: 643 request, 0 lỗi, đủ 8 bước, số thread 2 → 12 → 2 đúng hình dạng. Thử nhanh 40 s ở mức 150 VU thật: 4238 request, 0 lỗi, max 76 ms.
  - Lệnh chạy chính thức cả 2 plan ghi ở mục 9 của `notes/workflow-w2.md`.
- Tôi đã review / sửa gì: _(sinh viên điền sau khi review)_
