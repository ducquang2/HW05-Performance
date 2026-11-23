#!/bin/sh
# Reset trạng thái khóa (login_attempts=0, locked_until=NULL) cho mọi user.
# Dùng trước/sau khi chạy test lockout để user không bị khóa ở lần chạy sau.
# LƯU Ý: KHÔNG restart backend để reset. database.js DROP + reseed DB mỗi lần khởi động,
#        restart sẽ mất hết user perf*/lock* -> phải chạy lại: node scripts/setup-users.js
# DB backend đang dùng: database.sqlite (xem dbPath trong database.js). Có thể đổi bằng biến DB.
DB="${DB:-/Users/qutubun/Documents/hcmus/ktpm/HW02/eshop-sut/backend/database.sqlite}"

sqlite3 "$DB" "UPDATE users SET login_attempts = 0, locked_until = NULL;" || exit 1
sqlite3 "$DB" "SELECT 'Đã reset ' || COUNT(*) || ' user, còn khóa: ' || SUM(locked_until IS NOT NULL) FROM users;"
