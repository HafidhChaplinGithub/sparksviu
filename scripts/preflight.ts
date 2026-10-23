const issues: string[] = [];
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
console.log(
  "Konfigurasi dasar valid. Tetap lakukan UAT sandbox Flip dan pemeriksaan operasional sebelum peluncuran.",
);
