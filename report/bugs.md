# Bug report – HW05

Các issue được log trên GitHub Issues của repo SUT `kqanGit/eshop-sut`, gắn nhãn `Quang`, `HW05` và `performance` (nhãn `performance` chỉ dùng cho issue hiệu năng). Ảnh chụp trang Issues: `evidence/issues/github-issues.png`.

| # | Issue | Loại | Mức độ | Tóm tắt | Bằng chứng |
|---|---|---|---|---|---|
| 1 | [#174](https://github.com/kqanGit/eshop-sut/issues/174) | Performance | High | Biến `userCarts` không bao giờ được giải phóng. Trong lượt Soak, RSS của node tăng từ 234,5 lên 274,3 MB (khoảng 4,4 MB/phút) và không trả lại RAM sau khi dừng | `evidence/soak/node-usage.csv`, `server.js:14`, `server.js:290-309` |
| 2 | [#175](https://github.com/kqanGit/eshop-sut/issues/175) | Performance | Medium | Throughput bão hòa và latency tăng từ 400–450 VU: p50 tăng từ 1 lên 5 ms, CPU node đạt 138% | `results/20120359_Stress_20261124.jtl`, `evidence/stress/node-usage.csv` |
| 3 | [#176](https://github.com/kqanGit/eshop-sut/issues/176) | Bảo mật | High | `POST /api/login` và `GET /api/users/me` trả về cả mật khẩu dạng plaintext | `server.js:35`, `52`, `112-116` |
| 4 | [#177](https://github.com/kqanGit/eshop-sut/issues/177) | Chức năng | Low | `GET /api/products/:id` với id không tồn tại vẫn trả `200 {}` | `server.js:161` |

## Bug đã có issue từ trước, không log lại

Các bug này ảnh hưởng tới cách thiết kế test plan nhưng đã có người log, nên em chỉ ghi lại để tham chiếu:

| Issue | Nội dung | Ảnh hưởng tới HW05 |
|---|---|---|
| [#50](https://github.com/kqanGit/eshop-sut/issues/50), [#51](https://github.com/kqanGit/eshop-sut/issues/51) | `login_attempts` cộng 2 mỗi lần sai, nên sai 2 lần là bị khóa; thời gian khóa khoảng 180 s thay vì 30 s | Luồng tải không dùng mật khẩu sai. Trước và sau mỗi lượt chạy đều reset bằng `scripts/reset-state.sh` |
| [#34](https://github.com/kqanGit/eshop-sut/issues/34), [#35](https://github.com/kqanGit/eshop-sut/issues/35) | Checkout tin `total_amount` do client gửi lên và cho checkout khi giỏ rỗng | Bước checkout dùng `final_amount` lấy từ response của apply-coupon |
| [#36](https://github.com/kqanGit/eshop-sut/issues/36), [#162](https://github.com/kqanGit/eshop-sut/issues/162) | Giỏ hàng không được xóa sau khi thanh toán | Là nguyên nhân phía chức năng của #174 |

## Số bug và performance issue

- **2 performance issue:** #174, #175.
- **2 bug chức năng/bảo mật mới:** #176, #177.
- Không có lỗi crash, và cả 4 lượt chạy đều 0% lỗi.
