# HW05 – Performance Testing với JMeter (AI-first)

| Mục | Nội dung |
| --- | --- |
| MSSV | 20120359 |
| Họ tên | Nguyễn Đức Quang |
| Nhóm | 09 |
| Workflow | W2 – Browse & Coupon |
| SUT | EShop backend (`kqanGit/eshop-sut`), chạy local `http://localhost:3000` |
| Công cụ | Apache JMeter 5.6.3 |
| Repo | https://github.com/ducquang2/HW05-Performance |
| Video demo | https://youtu.be/KncU1IYrMR4 |
| Video skill | chưa có |

Report chính: [`report/HW05_Report.md`](report/HW05_Report.md).

## Bảng tự chấm

| No. | Tiêu chí | Điểm | Tự chấm |
|---|---|---|---|
| 1 | Task 1 – Load testing | 30 | 30 |
| 2 | Task 1 – Stress testing | 20 | 20 |
| 3 | Task 1 – Spike testing | 20 | 20 |
| 4 | Task 2 – AI analysis + misinterpretation hunt | 10 | 10 |
| 5 | Task 3 – Continuous Performance Testing | 10 | 10 |
| 6 | Agent Skills | 10 | 5 |
| | **Tổng** | **100** | **95** |

## Scenarios đã chạy

| Scenario | Test plan | VU | Hình dạng tải | Thời gian | Think |
|---|---|---|---|---|---|
| Load | `20120359_Load_20261124.jmx` | 30 | ramp 90 s rồi giữ 300 s | 390 s | 1–3 s |
| Stress | `20120359_Stress_20261124.jmx` | 50 → 500 | +50 VU mỗi 30 s | 300 s | 0–100 ms |
| Spike | `20120359_Spike_20261124.jmx` | nền 50 + đỉnh 400 | đỉnh vào ở giây 60, ramp 5 s, giữ 60 s | 210 s | 0–100 ms |
| Soak | `20120359_Soak_20261124.jmx` | 300 | ramp 60 s rồi giữ 600 s | 660 s | 0–100 ms |

## Nhóm endpoint đã phủ

| Nhóm | Endpoint |
|---|---|
| Auth | `POST /api/login`, `GET /api/users/me` |
| Read | `GET /api/categories`, `GET /api/products`, `GET /api/products/:id` |
| Transactional | `POST /api/cart`, `POST /api/apply-coupon`, `POST /api/checkout` |

## Ngưỡng endurance (Soak 10 phút)

| Chỉ số | Giá trị |
|---|---|
| Số VU ổn định tối đa | 300 VU |
| Throughput | ~6.390 req/s |
| p95 | 3 ms |
| Lỗi | 0% |
| RAM đỉnh node | 274 MB |
| RAM tăng | ~4,4 MB/phút (nghi rò rỉ, issue #174) |

## Bug / performance issue

Tổng 4 issue trên [`kqanGit/eshop-sut`](https://github.com/kqanGit/eshop-sut/issues), chi tiết ở [`report/bugs.md`](report/bugs.md):

- 2 performance issue: [#174](https://github.com/kqanGit/eshop-sut/issues/174), [#175](https://github.com/kqanGit/eshop-sut/issues/175)
- 2 bug khác (bảo mật, chức năng): [#176](https://github.com/kqanGit/eshop-sut/issues/176), [#177](https://github.com/kqanGit/eshop-sut/issues/177)

## Cấu trúc thư mục

```
report/      report chính, AI Audit, AI Critique, Task 2, Task 3, bug report
testplans/   4 file .jmx (Load, Stress, Spike, Soak)
data/        users.csv, categories.csv, coupons.csv
scripts/     tạo user, reset lockout, theo dõi RAM node, phân tích .jtl
evidence/    ảnh phần cứng, ảnh JMeter + CPU/RAM từng lượt, ảnh issues
notes/       endpoint SUT, workflow W2, review test plan
skill/       Agent Skill eshop-jmeter-perf
results/     file .jtl (không có trên GitHub)
reports/     HTML report (không có trên GitHub)
git_commit_log.txt
```

File `.jtl` (`results/`) và HTML report (`reports/`) không đưa vào git vì quá lớn (giới hạn GitHub 100 MB/file). Zip nộp có 4 HTML report và `.jtl` của Load; `.jtl` của Stress, Spike, Soak (nén 25 / 11 / 56 MB) để ở GitHub Release: https://github.com/ducquang2/HW05-Performance/releases/tag/results-20261124
