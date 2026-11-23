// Tạo user test quang_u001..quang_uNNN cho JMeter (workflow W2) và sinh các file CSV trong data/.
// Chạy: node scripts/setup-users.js [số user]  (mặc định 500; backend phải đang chạy ở BASE_URL)
// Lưu ý: restart backend sẽ reseed DB, mất user đã tạo -> chạy lại script này.
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DATA_DIR = path.join(__dirname, "..", "data");
const PASSWORD = "Quang1234!";
const USER_COUNT = Number(process.argv[2] || process.env.USER_COUNT || 500); // >= số VU lớn nhất (Stress 500)
if (!Number.isInteger(USER_COUNT) || USER_COUNT < 1 || USER_COUNT > 999) {
  console.error("Số user phải là số nguyên 1..999 (tên quang_uNNN có 3 chữ số)");
  process.exit(1);
}

const users = Array.from({ length: USER_COUNT }, (_, i) => `quang_u${String(i + 1).padStart(3, "0")}@eshop.com`);

async function post(url, body) {
  const res = await fetch(BASE_URL + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const login = (email) => post("/api/login", { email, password: PASSWORD });
const getJson = async (url) => (await fetch(BASE_URL + url)).json();

function writeCsv(file, header, rows) {
  const lines = [header, ...rows.map((r) => r.join(","))];
  fs.writeFileSync(path.join(DATA_DIR, file), lines.join("\n") + "\n");
  console.log(`  ${file}: ${rows.length} dòng dữ liệu`);
}

async function main() {
  // /api/register không kiểm tra email trùng, nên login thử trước, chỉ đăng ký khi chưa có.
  let created = 0, existed = 0;
  for (const email of users) {
    // 401 = chưa có user (mật khẩu luôn đúng); 200/403 = user đã có.
    if ((await login(email)).status !== 401) { existed++; continue; }
    const r = await post("/api/register", { name: email.split("@")[0], email, password: PASSWORD });
    if (r.status !== 200) throw new Error(`Đăng ký ${email} lỗi: ${r.status}`);
    created++;
  }

  // Xác nhận lại: cả USER_COUNT user phải login được.
  const failed = [];
  for (const email of users) {
    const r = await login(email);
    if (r.status !== 200 || !r.body?.token) failed.push(`${email} (${r.status})`);
  }

  // Chỉ lấy category có sản phẩm, để bước "chọn sản phẩm theo category" luôn tìm được id.
  const categories = await getJson("/api/categories");
  const products = await getJson("/api/products");
  const usedCategories = categories.filter((c) => products.some((p) => p.category_id === c.id));

  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log("Ghi file CSV:");
  writeCsv("users.csv", "email,password", users.map((e) => [e, PASSWORD]));
  writeCsv("categories.csv", "category_id,category_name", usedCategories.map((c) => [c.id, c.name]));
  // Chỉ dùng coupon fixed: SAVE10 (percent) tính discount âm, EXPIRED đã hết hạn.
  // total_amount phải > min_order_amount (backend so sánh >): VIP100 min 300000, BIGBUY min 500000.
  writeCsv("coupons.csv", "coupon_code,total_amount", [["VIP100", 600000], ["BIGBUY", 600000]]);

  console.log(`\nTóm tắt: tạo mới ${created}, đã có ${existed}, login OK ${USER_COUNT - failed.length}/${USER_COUNT}`);
  console.log(`Category có sản phẩm: ${usedCategories.length}/${categories.length}, sản phẩm: ${products.length}`);
  if (failed.length) {
    console.log("Login lỗi:", failed.join(", "));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
