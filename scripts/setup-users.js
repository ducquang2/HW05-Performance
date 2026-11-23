// Tạo user test cho JMeter và sinh các file CSV trong data/.
// Chạy: node scripts/setup-users.js  (backend phải đang chạy ở BASE_URL)
// Lưu ý: restart backend sẽ reseed DB, mất user đã tạo -> chạy lại script này.
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DATA_DIR = path.join(__dirname, "..", "data");
const PASSWORD = "Perf1234!";
const WRONG_PASSWORD = "Wrong999!";

const pad = (n, w) => String(n).padStart(w, "0");
const mainUsers = Array.from({ length: 200 }, (_, i) => `perf${pad(i + 1, 3)}@eshop.com`);
const lockUsers = Array.from({ length: 5 }, (_, i) => `lock${pad(i + 1, 2)}@eshop.com`);

async function post(url, body) {
  const res = await fetch(BASE_URL + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const login = (email, password) => post("/api/login", { email, password });

function writeCsv(file, header, rows) {
  const lines = [header, ...rows.map((r) => r.join(","))];
  fs.writeFileSync(path.join(DATA_DIR, file), lines.join("\n") + "\n");
  console.log(`  ${file}: ${rows.length} dòng dữ liệu`);
}

async function main() {
  // /api/register không kiểm tra email trùng, nên login thử trước, chỉ đăng ký khi chưa có.
  let created = 0, existed = 0;
  for (const email of [...mainUsers, ...lockUsers]) {
    // 401 = chưa có user (mật khẩu luôn đúng); 403 = user có nhưng đang bị khóa.
    if ((await login(email, PASSWORD)).status !== 401) { existed++; continue; }
    const r = await post("/api/register", { name: email.split("@")[0], email, password: PASSWORD });
    if (r.status !== 200) throw new Error(`Đăng ký ${email} lỗi: ${r.status}`);
    created++;
  }

  // Xác nhận lại: mọi user phải login được (lock user cũng login được trước khi test sai mật khẩu).
  const failed = [];
  for (const email of [...mainUsers, ...lockUsers]) {
    const r = await login(email, PASSWORD);
    if (r.status !== 200) failed.push(`${email} (${r.status})`);
  }

  const products = await (await fetch(BASE_URL + "/api/products")).json();
  // Keyword = từ dài nhất trong tên sản phẩm (iPhone, Samsung, MacBook...), cộng vài keyword không có kết quả.
  const keywords = [...new Set(products.map((p) => p.name.split(" ").sort((a, b) => b.length - a.length)[0]))];
  keywords.push("Pro", "Nokia", "xyz123");

  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log("Ghi file CSV:");
  writeCsv("users.csv", "email,password", mainUsers.map((e) => [e, PASSWORD]));
  writeCsv("lockout-users.csv", "email,wrong_password", lockUsers.map((e) => [e, WRONG_PASSWORD]));
  writeCsv("keywords.csv", "keyword", keywords.map((k) => [k]));
  writeCsv("products.csv", "product_id,name,price", products.map((p) => [p.id, `"${p.name}"`, p.price]));
  // Chỉ dùng coupon fixed: percent (SAVE10) tính sai discount. total_amount phải > min_order_amount (so sánh >).
  writeCsv("coupons.csv", "code,total_amount", [["VIP100", 600000], ["BIGBUY", 600000]]);

  console.log(`\nTóm tắt: tạo mới ${created}, đã có ${existed}, login OK ${205 - failed.length}/205`);
  console.log(`Sản phẩm: ${products.length}, keyword: ${keywords.length}`);
  if (failed.length) {
    console.log("Login lỗi:", failed.join(", "));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
