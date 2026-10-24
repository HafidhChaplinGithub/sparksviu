export {};
const issues: string[] = [];
if (process.env.UAT_MODE === 'true' && (process.env.REGISTRATION_ENABLED === 'true' || process.env.SMTP_HOST || !['disabled',undefined,''].includes(process.env.FLIP_MODE)))
  issues.push('UAT wajib menutup registrasi, SMTP, dan Flip. Gunakan database khusus UAT.');
if (process.env.UAT_MODE === 'true' && process.env.PAYOUT_MODE !== 'manual')
  issues.push('UAT menggunakan PAYOUT_MODE=manual.');
if (process.env.PAYOUT_MODE && !['manual','flip'].includes(process.env.PAYOUT_MODE)) issues.push('PAYOUT_MODE tidak valid.');
if (!process.env.DATABASE_URL) issues.push("DATABASE_URL wajib diisi.");
if (!process.env.APP_URL?.startsWith("https://"))
  issues.push("APP_URL produksi harus HTTPS.");
if (Buffer.from(process.env.ENCRYPTION_KEY || "", "base64").length !== 32)
  issues.push("ENCRYPTION_KEY harus 32 byte base64.");
if (
  process.env.REGISTRATION_ENABLED === "true" &&
  (process.env.POLICIES_APPROVED !== "true" ||
    !process.env.SMTP_HOST ||
    !process.env.SMTP_FROM ||
    !process.env.SUPPORT_EMAIL)
)
  issues.push(
    "Pendaftaran memerlukan kebijakan yang disetujui, SMTP, dan kontak dukungan.",
  );
if (
  process.env.FLIP_MODE === "live" &&
  (!process.env.FLIP_API_KEY || !process.env.FLIP_CALLBACK_TOKEN)
)
  issues.push("Flip live memerlukan API key dan callback token.");
if (issues.length) {
  console.error(issues.join("\n"));
  process.exit(1);
}
const {db}=await import('../src/lib/db');
try {
  const uat=process.env.UAT_MODE==='true';
  const q=await db.query('SELECT EXISTS(SELECT 1 FROM users WHERE is_demo<>$1) OR EXISTS(SELECT 1 FROM campaigns WHERE is_demo<>$1) AS mixed',[uat]);
  if(q.rows[0].mixed) throw Error('Mode database tidak sesuai. Pisahkan database UAT dan operasional; jangan mencampur data latihan dengan akun nyata.');
}finally {await db.end();}
console.log(
  "Konfigurasi dasar valid. Tetap lakukan UAT sandbox Flip dan pemeriksaan operasional sebelum peluncuran.",
);
