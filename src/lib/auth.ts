import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
  createHmac,
} from "node:crypto";
import { cookies } from "next/headers";
import { db, tx, audit } from "./db";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function passwordHash(p: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(p, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex")}`;
}
export function passwordValid(p: string, stored: string) {
  const [salt, h] = stored.split(":");
  const actual = scryptSync(p, salt, 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(h, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function encrypt(s: string) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw Error("ENCRYPTION_KEY belum dikonfigurasi.");
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key, iv);
  return Buffer.concat([iv, c.update(s), c.final(), c.getAuthTag()]).toString(
    "base64",
  );
}
export function decrypt(s: string) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw Error("Kunci enkripsi tidak valid.");
  const b = Buffer.from(s, "base64");
  const d = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(-16));
  return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString();
}
export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  email_verified_at: string | null;
  totp_confirmed: boolean;
};
export async function currentSessionHash() {
  const value = (await cookies()).get("sv_session")?.value;
  return value ? hash(value) : "";
}
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get("sv_session")?.value;
  if (!token) return null;
  const r = await db.query(
    "SELECT u.id,u.email,u.name,u.role,u.email_verified_at,u.totp_confirmed FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=$1 AND s.expires_at>now() AND u.disabled_at IS NULL",
    [hash(token)],
  );
  return r.rows[0] || null;
}
export function requireRole(u: User | null, roles: string[]) {
  if (!u) throw Error("Silakan masuk terlebih dahulu.");
  if (!roles.includes(u.role)) throw Error("Akses tidak diizinkan.");
  if (u.role !== "participant" && !u.totp_confirmed)
    throw Error(
      "Aktifkan autentikasi dua langkah di Profil sebelum mengelola data.",
    );
  return u;
}
export async function setSessionCookie(token: string) {
  (await cookies()).set("sv_session", token, {
    httpOnly: true,
    secure: process.env.APP_URL?.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 604800,
  });
}
async function insertSession(c: import("./db").SQL, user: string) {
  const token = randomBytes(32).toString("base64url");
  await c.query(
    "INSERT INTO sessions(id_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [hash(token), user],
  );
  return token;
}
function matchTotp(
  row: { totp_secret: string | null; totp_last_step: string | number },
  code: string,
) {
  if (!row.totp_secret || !/^\d{6}$/.test(code)) return undefined;
  const step = Math.floor(Date.now() / 30000),
    secret = decrypt(row.totp_secret);
  return [step - 1, step, step + 1].find(
    (s) =>
      s > Number(row.totp_last_step) &&
      timingSafeEqual(Buffer.from(totp(secret, s)), Buffer.from(code)),
  );
}
export async function authenticate(
  email: string,
  password: string,
  code: string,
) {
  return tx(async (c) => {
    // The account lock orders credential revocation, factor activation and session issuance.
    const q = await c.query(
      "SELECT * FROM users WHERE email=$1 AND disabled_at IS NULL FOR UPDATE",
      [email],
    );
    const row = q.rows[0];
    const dummy =
      "00000000000000000000000000000000:6150b42b6822e054a34655fb9e0b0ea56f179a807efac9b2b6f4d68a811a9333a0e665e511418858d1877fb8af3bf5754b79c6855bbc982b50b4f8cba717bd4a";
    if (!passwordValid(password, row?.password_hash || dummy) || !row)
      throw Error("Email, kata sandi, atau kode tidak sesuai.");
    if (row.totp_confirmed) {
      const step = matchTotp(row, code);
      if (step === undefined)
        throw Error("Email, kata sandi, atau kode tidak sesuai.");
      await c.query("UPDATE users SET totp_last_step=$2 WHERE id=$1", [
        row.id,
        step,
      ]);
    }
    const token = await insertSession(c, row.id);
    await audit(c, row.id, "auth.login", row.id);
    return token;
  });
}
export async function startTotp(user: string, password: string) {
  return tx(async (c) => {
    const q = await c.query(
      "SELECT * FROM users WHERE id=$1 AND disabled_at IS NULL FOR UPDATE",
      [user],
    );
    const row = q.rows[0];
    if (
      !row ||
      !passwordValid(password, row.password_hash) ||
      row.totp_confirmed
    )
      throw Error("Kata sandi salah atau TOTP sudah aktif.");
    const secret = newTotp();
    await c.query(
      "UPDATE users SET totp_secret=$2,totp_last_step=0 WHERE id=$1 AND totp_confirmed=false",
      [user, encrypt(secret)],
    );
    return secret;
  });
}
export async function confirmTotp(
  user: string,
  code: string,
  sessionHash: string,
) {
  return tx(async (c) => {
    const q = await c.query(
      "SELECT * FROM users WHERE id=$1 AND disabled_at IS NULL FOR UPDATE",
      [user],
    );
    const row = q.rows[0];
    const origin = await c.query(
      "SELECT 1 FROM sessions WHERE id_hash=$1 AND user_id=$2 AND expires_at>now()",
      [sessionHash, user],
    );
    if (!origin.rowCount)
      throw Error("Sesi telah dicabut. Silakan masuk kembali.");
    if (!row || row.totp_confirmed)
      throw Error("Autentikator sudah aktif atau akun tidak tersedia.");
    const step = matchTotp(row, code);
    if (step === undefined) throw Error("Kode tidak sesuai.");
    await c.query(
      "UPDATE users SET totp_confirmed=true,totp_last_step=$2 WHERE id=$1",
      [user, step],
    );
    await c.query("DELETE FROM sessions WHERE user_id=$1", [user]);
    const token = await insertSession(c, user);
    await audit(c, user, "auth.totp.enabled", user);
    return token;
  });
}
export async function logout() {
  const jar = await cookies();
  const t = jar.get("sv_session")?.value;
  if (t) await db.query("DELETE FROM sessions WHERE id_hash=$1", [hash(t)]);
  jar.delete("sv_session");
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const r = await db.query(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING count",
    [hash(key), seconds],
  );
  if (r.rows[0].count > limit)
    throw Error("Terlalu banyak percobaan. Coba beberapa saat lagi.");
}
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newTotp() {
  const b = randomBytes(20);
  let bits = "",
    out = "";
  for (const v of b) bits += v.toString(2).padStart(8, "0");
  for (let i = 0; i < bits.length; i += 5)
    out += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
export function totp(secret: string, step: number) {
  let bits = "";
  for (const ch of secret)
    bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const n = Buffer.alloc(8);
  n.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", Buffer.from(bytes)).update(n).digest(),
    o = h[19] & 15;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
export async function verifyTotp(user: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  return tx(async (c) => {
    const r = await c.query(
      "SELECT totp_secret,totp_last_step FROM users WHERE id=$1 FOR UPDATE",
      [user],
    );
    if (!r.rows[0]?.totp_secret) return false;
    const step = Math.floor(Date.now() / 30000),
      secret = decrypt(r.rows[0].totp_secret);
    const match = [step - 1, step, step + 1].find(
      (s) =>
        s > Number(r.rows[0].totp_last_step) &&
        timingSafeEqual(Buffer.from(totp(secret, s)), Buffer.from(code)),
    );
    if (match === undefined) return false;
    await c.query("UPDATE users SET totp_last_step=$2 WHERE id=$1", [
      user,
      match,
    ]);
    return true;
  });
}
export async function authToken(
  user: string,
  email: string,
  kind: "verify" | "reset",
) {
  const token = randomBytes(32).toString("base64url");
  await tx(async (c) => {
    await c.query("DELETE FROM auth_tokens WHERE user_id=$1 AND kind=$2", [
      user,
      kind,
    ]);
    await c.query(
      "INSERT INTO auth_tokens(id_hash,user_id,kind,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [hash(token), user, kind],
    );
    await c.query(
      "INSERT INTO outbox(event_key,kind,payload) VALUES($1,'email',$2)",
      [
        `auth:${hash(token)}`,
        JSON.stringify({
          to: email,
          subject:
            kind === "verify"
              ? "Verifikasi email Sparksviu"
              : "Atur ulang kata sandi Sparksviu",
          text: `Buka ${process.env.APP_URL}/${kind === "verify" ? "verifikasi" : "reset"}?token=${token}\nLink berlaku 1 jam. Abaikan jika Anda tidak meminta.`,
        }),
      ],
    );
    await audit(c, user, `auth.${kind}.requested`, user);
  });
}
