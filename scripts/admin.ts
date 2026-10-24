import { db } from "../src/lib/db";
import { passwordHash } from "../src/lib/auth";
if(process.env.UAT_MODE==='true')throw Error('Gunakan seed:uat untuk akun latihan. Administrator nyata dibuat pada database operasional terpisah.');
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(),
  password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 14)
  throw Error(
    "Set ADMIN_EMAIL dan ADMIN_PASSWORD (minimal 14 karakter), hanya untuk proses ini.",
  );
await db.query(
  "INSERT INTO users(email,name,password_hash,role,email_verified_at) VALUES($1,$2,$3,'superadmin',now())",
  [email, process.env.ADMIN_NAME || "Administrator", passwordHash(password)],
);
console.log("Administrator dibuat. Masuk lalu aktifkan TOTP di Profil.");
await db.end();
