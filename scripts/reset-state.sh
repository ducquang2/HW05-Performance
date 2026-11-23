#!/bin/sh
# Đưa dữ liệu về trạng thái ban đầu giữa các lượt chạy JMeter (W2). Chạy khi JMeter đã dừng.
#   1. Mở khóa mọi user: login_attempts = 0, locked_until = NULL.
#   2. Xóa đơn hàng (orders) và lượt dùng coupon (coupon_usage) của user quang_u*.
#   3. Login thử quang_u001 để chắc tài khoản dùng được.
# Giỏ hàng: nằm trong RAM backend (userCarts, server.js:14), không có API xóa giỏ, checkout cũng không xóa.
#   -> Chỉ xóa được bằng restart backend. Restart thì DB bị DROP + reseed (database.js:13-20),
#      mất user test -> phải chạy lại: node scripts/setup-users.js
#   Giỏ cũ không làm checkout lỗi (checkout không đọc giỏ), chỉ làm GET /api/cart trả về dài hơn.
#   Muốn số liệu sạch (nhất là soak) thì restart backend + setup-users.js trước lượt chạy.
# Không có tồn kho nên không cần nạp kho.
DB="${DB:-/Users/qutubun/Documents/hcmus/ktpm/HW02/eshop-sut/backend/database.sqlite}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
sql() { sqlite3 -cmd ".timeout 5000" "$DB" "$1"; } # chờ tối đa 5s nếu backend đang giữ khóa ghi

echo "Reset lúc: $(date '+%Y-%m-%d %H:%M:%S')"

sql "UPDATE users SET login_attempts = 0, locked_until = NULL;" || exit 1
sql "DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'quang\_u%' ESCAPE '\');
      DELETE FROM coupon_usage WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'quang\_u%' ESCAPE '\');" || exit 1
sql "SELECT 'User: ' || COUNT(*) || ', còn khóa: ' || SUM(locked_until IS NOT NULL) || ', quang_u*: ' || SUM(email LIKE 'quang\_u%' ESCAPE '\') FROM users;
      SELECT 'Đơn của quang_u* còn lại: ' || COUNT(*) FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'quang\_u%' ESCAPE '\');"

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
  -d '{"email":"quang_u001@eshop.com","password":"Quang1234!"}' "$BASE_URL/api/login")
echo "Login thử quang_u001: HTTP $STATUS"
[ "$STATUS" = "200" ] || exit 1
