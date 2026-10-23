import { chromium } from "playwright";
import { Pool } from "pg";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:3000";
const output = process.env.QA_OUTPUT || "/scratch";
const password = process.env.DEMO_PASSWORD;
if (!password || !process.env.DATABASE_URL?.endsWith("/sv_browser"))
  throw Error("Browser QA requires the isolated sv_browser demo fixture.");
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
const results = [];
const errors = [];
function otp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret)
    bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const step = Buffer.alloc(8);
  step.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", Buffer.from(bytes)).update(step).digest(),
    offset = h[19] & 15;
  return ((h.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
async function context() {
  const c = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
  });
  c.on("page", (p) => {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("request", (r) => {
      if (!r.url().startsWith(base) && !r.url().startsWith("data:"))
        errors.push("Unexpected external request " + new URL(r.url()).hostname);
    });
  });
  return c;
}
async function visit(page, path) {
  const r = await page.goto(base + path);
  assert.ok(r.status() < 500, `${path} status ${r.status()}`);
  await page.locator("main").waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.locator("h1").count(), `${path} has a heading`);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    `${path} horizontal overflow`,
  );
  results.push("route " + path);
}
async function login(page, email) {
  await visit(page, "/masuk");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL(base + "/app");
}
async function submit(page, name, scope = page) {
  const req = page.waitForResponse(
    (r) => r.url().endsWith("/api/commands") && r.request().method() === "POST",
  );
  await scope.getByRole("button", { name, exact: true }).click();
  const response = await req;
  const data = await response.json();
  assert.ok(response.ok(), data.error);
  await page.waitForTimeout(120);
  return data;
}
const creator = await context(),
  page = await creator.newPage();
try {
  await visit(page, "/");
  console.log(
    "Page metrics",
    await page.evaluate(() => ({
      w: innerWidth,
      h: innerHeight,
      scroll: document.documentElement.scrollHeight,
      body: document.body.scrollHeight,
    })),
  );
  await page.screenshot({ path: output + "/desktop.png", fullPage: false });
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .locator(".skip-link")
      .evaluate((e) => e === document.activeElement),
    true,
  );
  results.push("keyboard skip link");
  for (const path of [
    "/kampanye",
    "/bantuan",
    "/syarat",
    "/kebijakan",
    "/daftar",
    "/lupa-password",
  ])
    await visit(page, path);
  await visit(page, "/kampanye");
  await page
    .getByRole("textbox", { name: "Cari film atau studio" })
    .fill("Sepatu");
  assert.equal(await page.locator(".grid .rc").count(), 1);
  await page
    .getByRole("combobox", { name: "Filter platform" })
    .selectOption("instagram");
  assert.equal(await page.locator(".grid .rc").count(), 1);
  results.push("campaign filters");
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/");
  await page.screenshot({ path: output + "/mobile.png", fullPage: true });
  await page.getByRole("button", { name: /Tema auto/ }).click();
  await page.screenshot({ path: output + "/dark.png", fullPage: true });
  await page.getByRole("button", { name: /Tema dark/ }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "kreator@example.test");
  for (const path of [
    "/app/kampanye",
    "/app/pekerjaan",
    "/app/pendapatan",
    "/app/cairkan",
    "/app/payout",
    "/app/profil",
    "/app/notifikasi",
  ])
    await visit(page, path);
  await visit(page, "/ops");
  await page.getByRole("heading", { name: "Akses belum tersedia." }).waitFor();
  results.push("participant staff boundary");
  const exportDenied = await creator.request.get(base + "/api/export");
  assert.equal(exportDenied.status(), 403);
  const csrf = await creator.request.post(base + "/api/commands", {
    headers: { Origin: "https://untrusted.example" },
    data: { action: "profile", data: { name: "Wrong" } },
  });
  assert.equal(csrf.status(), 400);
  results.push("export role and CSRF boundary");
  await visit(page, "/kampanye/demo-rumah-tanpa-jendela");
  await submit(page, "Ambil slot kampanye");
  await page.waitForURL(base + "/app/pekerjaan");
  await page
    .getByLabel("Link asli posting")
    .fill("https://www.tiktok.com/@kreator_demo/video/1234567890123456789");
  await submit(page, "Kirim link posting");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF5kAAAAASUVORK5CYII=",
    "base64",
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "bukti-views.png",
    mimeType: "image/png",
    buffer: png,
  });
  const uploaded = page.waitForResponse((r) => r.url().endsWith("/api/upload"));
  await page.getByRole("button", { name: "Unggah file", exact: true }).click();
  assert.equal((await uploaded).status(), 200);
  await page.waitForTimeout(200);
  results.push("slot, posting and private evidence upload");
  const admin = await context(),
    staff = await admin.newPage();
  await login(staff, "admin@example.test");
  await visit(staff, "/app/profil");
  await staff.getByLabel("Konfirmasi kata sandi").fill(password);
  const setup = await submit(staff, "Buat secret autentikator");
  await staff.getByLabel("Kode 6 digit").fill(otp(setup.secret));
  await submit(staff, "Aktifkan autentikator");
  await staff.reload();
  await staff
    .getByText("Autentikator aktif. Kode diperlukan setiap masuk.", {
      exact: true,
    })
    .waitFor();
  await visit(staff, "/ops/review");
  await staff.getByLabel("Keputusan").selectOption("approved");
  await staff
    .getByLabel("Alasan dan pemeriksaan kepemilikan / kesesuaian brief")
    .fill("Akun dan posting dummy sesuai brief pengujian browser.");
  await submit(staff, "Simpan hasil review");
  results.push("staff TOTP enrollment and posting review");
  await visit(page, "/app/pekerjaan");
  await page.getByLabel("Views pada bukti").fill("40000");
  const local = new Date();
  const localInput = new Date(
    local.getTime() - local.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);
  await page.getByLabel("Waktu bukti diambil (waktu lokal)").fill(localInput);
  await submit(page, "Laporkan views");
  await visit(staff, "/ops/review");
  await staff.getByLabel("Validasi bukti").selectOption("true");
  await staff
    .getByLabel("Catatan pemeriksaan views / indikasi manipulasi")
    .fill("Bukti dummy dan waktu pengambilan diperiksa untuk UAT.");
  await submit(staff, "Simpan validasi");
  await db.query(
    "UPDATE campaigns SET upload_deadline=now()-interval '2 minutes',cutoff_at=now() WHERE slug='demo-rumah-tanpa-jendela'",
  );
  await visit(staff, "/ops/review");
  const options = await staff
    .getByLabel("Snapshot final (dalam 60 menit sebelum cutoff)")
    .locator("option")
    .evaluateAll((nodes) => nodes.map((n) => n.value));
  await staff
    .getByLabel("Snapshot final (dalam 60 menit sebelum cutoff)")
    .selectOption(options[1]);
  await staff
    .getByLabel("Ringkasan penilaian")
    .fill("Penilaian final berdasarkan snapshot valid pada cutoff dummy.");
  await submit(staff, "Terbitkan penilaian reward");
  await visit(page, "/app/pekerjaan");
  await page.getByText("Reward penilaian:", { exact: false }).waitFor();
  await page
    .getByLabel("Alasan & bukti pendukung")
    .fill("Mohon periksa ulang bukti ini sebagai uji keberatan peserta.");
  await submit(page, "Ajukan keberatan");
  results.push("reported views, validation, assessment and dispute");
  await visit(page, "/app/profil");
  await page.getByLabel("Nomor rekening").fill("1234567890");
  await page.getByLabel("Nama pemilik sesuai rekening").fill("Kreator Demo");
  await submit(page, "Tambah rekening");
  await visit(staff, "/finance");
  await staff
    .getByText("Periksa nomor rekening lengkap", { exact: true })
    .click();
  await staff
    .getByLabel("Alasan mengakses data rekening")
    .fill("Pemeriksaan rekening dummy untuk pengujian internal.");
  await submit(staff, "Tampilkan untuk pemeriksaan");
  await staff.getByLabel("Hasil pemeriksaan").selectOption("true");
  await staff
    .getByLabel("Sumber bukti kepemilikan dan hasil pencocokan")
    .fill("Bukti sintetis diperiksa; ini rekening dummy pengujian.");
  await submit(staff, "Simpan verifikasi");
  await db.query(
    "UPDATE payment_destinations SET verified_at=now()-interval '25 hours' WHERE user_id=(SELECT id FROM users WHERE email='kreator@example.test')",
  );
  await db.query(
    "UPDATE wallets SET available=80000 WHERE user_id=(SELECT id FROM users WHERE email='kreator@example.test')",
  );
  await visit(page, "/app/cairkan");
  await page.getByLabel("Nominal (Rp)").fill("50000");
  page.once("dialog", (d) => d.accept());
  await submit(page, "Ajukan pencairan");
  await visit(page, "/app/payout");
  await page.getByText("Diajukan", { exact: true }).waitFor();
  await visit(staff, "/finance");
  await staff.screenshot({ path: output + "/finance.png", fullPage: true });
  await staff.getByRole("checkbox", { name: /Pilih pencairan/ }).check();
  staff.once("dialog", (d) => d.accept());
  const approve = staff.waitForResponse((r) =>
    r.url().endsWith("/api/commands"),
  );
  await staff.getByRole("button", { name: "Setujui batch (1)" }).click();
  assert.equal((await approve).status(), 400);
  await staff
    .getByText("Integrasi Flip belum diaktifkan.", { exact: true })
    .waitFor();
  results.push(
    "finance destination review, withdrawal hold and disabled-provider gate",
  );
  await visit(page, "/app/payout");
  page.once("dialog", (d) => d.accept());
  await submit(page, "Batalkan pengajuan");
  await page.getByText("Dibatalkan", { exact: true }).waitFor();
  await visit(page, "/app");
  await page.screenshot({ path: output + "/dashboard.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "/app/pekerjaan");
  await page.screenshot({ path: output + "/work-mobile.png", fullPage: true });
  for (const path of [
    "/ops/kampanye",
    "/ops/sengketa",
    "/ops/pengguna",
    "/ops/audit",
  ])
    await visit(staff, path);
  await staff.screenshot({ path: output + "/operations.png", fullPage: true });
  await visit(staff, "/ops/kampanye");
  const editor = staff
    .locator("details.card")
    .filter({ has: staff.getByText("Buat kampanye baru", { exact: true }) });
  await editor.locator("summary").click();
  for (const [label, value] of [
    ["Judul film", "Film Browser QA"],
    ["Slug URL", "film-browser-qa"],
    ["Studio / klien", "Studio UAT"],
    ["Genre", "Drama"],
    [
      "Brief, tugas, disclosure, dan larangan spoiler",
      "Kampanye pengujian browser. Buat konten orisinal, ungkapkan promosi berbayar dan jangan memakai materi tanpa izin.",
    ],
  ])
    await editor.getByLabel(label).fill(value);
  const future = (days) =>
    new Date(
      Date.now() + days * 86400000 - new Date().getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16);
  await editor.getByLabel("Tenggat unggah (waktu lokal)").fill(future(3));
  await editor.getByLabel("Cutoff views (waktu lokal)").fill(future(4));
  await editor.getByLabel("Jumlah slot").fill("2");
  await editor.getByLabel("Budget reward (Rp)").fill("200000");
  await submit(staff, "Simpan sebagai draf", editor);
  const film = staff
    .locator("article.card")
    .filter({
      has: staff.getByRole("heading", { name: "Film Browser QA", exact: true }),
    });
  await film.getByLabel("Status kampanye").selectOption("open");
  await submit(staff, "Ubah status", film);
  await visit(page, "/kampanye/film-browser-qa");
  await submit(page, "Ambil slot kampanye");
  await page.waitForURL(base + "/app/pekerjaan");
  await film.getByText("Versi tarif baru", { exact: true }).click();
  await film.getByLabel("Tarif / 1.000 views (Rp)").fill("3000");
  await submit(staff, "Simpan versi tarif", film);
  const version = await db.query(
    "SELECT p.rule_id,c.current_rule_id,r.config FROM participations p JOIN campaigns c ON c.id=p.campaign_id JOIN campaign_rules r ON r.id=p.rule_id WHERE c.slug='film-browser-qa'",
  );
  assert.notEqual(version.rows[0].rule_id, version.rows[0].current_rule_id);
  assert.equal(version.rows[0].config.rate, 2000);
  results.push("campaign create, publish and immutable slot tariff");
  await film.getByText("Unggah materi berlisensi", { exact: true }).click();
  await film
    .locator("input[type=file]")
    .setInputFiles({
      name: "materi-film.png",
      mimeType: "image/png",
      buffer: png,
    });
  await film
    .getByLabel("Materi boleh diakses mulai (waktu lokal)")
    .fill(future(-1));
  await film
    .getByLabel("Hak penggunaan / larangan spoiler")
    .fill("Materi sintetis khusus uji; tidak untuk dipublikasikan.");
  const assetUpload = staff.waitForResponse((r) =>
    r.url().endsWith("/api/upload"),
  );
  await film.getByRole("button", { name: "Unggah file", exact: true }).click();
  assert.equal((await assetUpload).status(), 200);
  await visit(page, "/app/pekerjaan");
  const work = page
    .locator("article.card")
    .filter({
      has: page.getByRole("heading", { name: "Film Browser QA", exact: true }),
    });
  await work.getByText("Tarif & materi kampanye", { exact: true }).click();
  const assetHref = await work
    .getByRole("link", { name: "Unduh", exact: true })
    .getAttribute("href");
  assert.equal((await creator.request.get(base + assetHref)).status(), 200);
  const anonymous = await context();
  assert.equal((await anonymous.request.get(base + assetHref)).status(), 401);
  await anonymous.close();
  results.push(
    "licensed asset upload, embargo-ready download and anonymous denial",
  );
  await work
    .getByLabel("Link asli posting")
    .fill("https://www.tiktok.com/@kreator_demo/video/2234567890123456789");
  await submit(page, "Kirim link posting", work);
  await visit(staff, "/ops/review");
  const review = staff
    .locator("article.card")
    .filter({
      has: staff.getByRole("heading", { name: "Film Browser QA", exact: true }),
    });
  await review.getByLabel("Keputusan").selectOption("revision");
  await review
    .getByLabel("Alasan dan pemeriksaan kepemilikan / kesesuaian brief")
    .fill("Revisi catatan pada posting dummy untuk pengujian.");
  await submit(staff, "Simpan hasil review", review);
  await visit(page, "/app/pekerjaan");
  await work
    .getByLabel("Catatan untuk reviewer")
    .fill("Catatan revisi diperbarui pada posting yang sama.");
  await submit(page, "Kirim revisi", work);
  await visit(staff, "/ops/review");
  await review.getByLabel("Keputusan").selectOption("rejected");
  await review
    .getByLabel("Alasan dan pemeriksaan kepemilikan / kesesuaian brief")
    .fill("Penolakan dummy untuk memverifikasi pelepasan reservasi.");
  await submit(staff, "Simpan hasil review", review);
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT reserved FROM campaigns WHERE slug='film-browser-qa'",
        )
      ).rows[0].reserved,
    ),
    0,
  );
  assert.equal((await creator.request.get(base + assetHref)).status(), 404);
  results.push(
    "revision, rejection, budget release and asset access revocation",
  );
  assert.deepEqual(errors, []);
  results.push("no browser runtime errors or external requests");
  await writeFile(
    output + "/browser-results.json",
    JSON.stringify({ passed: true, steps: results, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, steps: results.length, errors }));
} catch (error) {
  await writeFile(
    output + "/browser-results.json",
    JSON.stringify(
      { passed: false, steps: results, error: error.message, errors },
      null,
      2,
    ),
  );
  for (const c of browser.contexts())
    for (const p of c.pages())
      console.log(
        "Failure page",
        p.url(),
        (
          await p
            .locator("main")
            .innerText()
            .catch(() => "")
        ).slice(0, 3000),
      );
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await db.end();
}
