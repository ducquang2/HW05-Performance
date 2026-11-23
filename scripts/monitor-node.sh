#!/bin/sh
# Ghi CPU và RAM (RSS) của process backend mỗi 60 giây vào file CSV, dùng cho mọi lượt chạy chính thức.
#   bash scripts/monitor-node.sh <file.csv> [PID]
# Không có PID thì tự tìm process "node server.js".
# Bật TRƯỚC khi chạy jmeter (ở terminal khác hoặc thêm & ở cuối). Tự dừng khi JMeter đã chạy rồi kết thúc,
# hoặc khi backend không còn; dừng tay bằng Ctrl+C.
# %CPU lấy từ ps (macOS: trung bình gần đây, 100% = 1 nhân), có thể khác một chút so với Activity Monitor.
# INTERVAL (giây) chỉ đổi khi chạy thử: INTERVAL=10 bash scripts/monitor-node.sh ...
OUT="$1"
PID="${2:-$(pgrep -f '^node server\.js$' | head -1)}"
INTERVAL="${INTERVAL:-60}"
[ -n "$OUT" ] || { echo "Cách dùng: bash scripts/monitor-node.sh <file.csv> [PID]"; exit 1; }
[ -n "$PID" ] || { echo "Không tìm thấy process node server.js"; exit 1; }

mkdir -p "$(dirname "$OUT")"
echo "time,cpu_percent,rss_mb" > "$OUT"
echo "Theo dõi PID $PID mỗi $INTERVAL s -> $OUT (Ctrl+C để dừng)"
SEEN_JMETER=0
while :; do
  LINE=$(ps -o %cpu= -o rss= -p "$PID") || { echo "Process $PID đã dừng"; break; }
  echo "$LINE" | awk -v t="$(date '+%Y-%m-%d %H:%M:%S')" '{printf "%s,%s,%.1f\n", t, $1, $2/1024}' | tee -a "$OUT"
  if pgrep -f ApacheJMeter > /dev/null; then SEEN_JMETER=1
  elif [ "$SEEN_JMETER" = 1 ]; then echo "JMeter đã kết thúc, dừng theo dõi"; break
  fi
  sleep "$INTERVAL"
done
