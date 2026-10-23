import { z } from "zod";
import { db, tx, audit } from "./db";
import {
  currentUser,
  authenticate,
  setSessionCookie,
  startTotp,
  confirmTotp,
  passwordHash,
  passwordValid,
  currentSessionHash,
  logout,
  rateLimit,
  authToken,
  hash,
  verifyTotp,
  newTotp,
  encrypt,
  decrypt,
  requireRole,
} from "./auth";
import { rulesSchema } from "./domain";
import * as campaigns from "./campaigns";
import * as payouts from "./payouts";
const id = z.uuid();
const text = z.string().trim().min(1).max(2000);
const reason = z.string().trim().min(10).max(2000);
const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const password = z.string().min(12).max(128);
const strict = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
export async function command(action: string, input: unknown) {
  const u = await currentUser();
  switch (action) {
    case "login": {
      const v = strict({
        email,
        password: z.string().min(1).max(128),
        code: z.string().max(6).default(""),
      }).parse(input);
      await rateLimit("login:global", 200, 60);
      await rateLimit(`login:${v.email}`, 8, 900);
      const token = await authenticate(v.email, v.password, v.code);
      await setSessionCookie(token);
      return { redirect: "/app" };
    }
    case "logout":
      await logout();
      return { redirect: "/" };
    case "register": {
      if (
        process.env.REGISTRATION_ENABLED !== "true" ||
        process.env.POLICIES_APPROVED !== "true" ||
        !process.env.SMTP_HOST
      )
        throw Error("Pendaftaran belum dibuka.");
      const v = strict({
        name: z.string().trim().min(2).max(100),
        email,
        password,
        consent: z.literal(true),
      }).parse(input);
      await rateLimit("register:global", 20, 3600);
      const r = await tx(async (c) => {
        const q = await c.query(
          "INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id",
          [v.email, v.name, passwordHash(v.password)],
        );
        await c.query("INSERT INTO wallets(user_id) VALUES($1)", [
          q.rows[0].id,
        ]);
        await audit(c, q.rows[0].id, "auth.registered", q.rows[0].id, {
          consentVersion: "2026-10-23",
        });
        return q.rows[0];
      });
      await authToken(r.id, v.email, "verify");
      return {
        redirect: "/masuk",
        message: "Akun dibuat. Cek email verifikasi.",
      };
    }
    case "forgot": {
      const v = strict({ email }).parse(input);
      await rateLimit("reset:global", 100, 60);
      await rateLimit(`reset:${v.email}`, 3, 3600);
      const q = await db.query(
        "SELECT id FROM users WHERE email=$1 AND disabled_at IS NULL",
        [v.email],
      );
      if (q.rowCount) await authToken(q.rows[0].id, v.email, "reset");
      return {
        message: "Jika email terdaftar, tautan pengaturan ulang akan dikirim.",
      };
    }
    case "reset": {
      const v = strict({ token: z.string().min(40).max(100), password }).parse(
        input,
      );
      await tx(async (c) => {
        const q = await c.query(
          "DELETE FROM auth_tokens WHERE id_hash=$1 AND kind='reset' AND expires_at>now() RETURNING user_id",
          [hash(v.token)],
        );
        if (!q.rowCount) throw Error("Tautan kedaluwarsa atau sudah dipakai.");
        await c.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
          q.rows[0].user_id,
          passwordHash(v.password),
        ]);
        await c.query("DELETE FROM sessions WHERE user_id=$1", [
          q.rows[0].user_id,
        ]);
        await audit(
          c,
          q.rows[0].user_id,
          "auth.password.reset",
          q.rows[0].user_id,
        );
      });
      return { redirect: "/masuk" };
    }
    case "verify": {
      const v = strict({ token: z.string().min(40).max(100) }).parse(input);
      await tx(async (c) => {
        const q = await c.query(
          "DELETE FROM auth_tokens WHERE id_hash=$1 AND kind='verify' AND expires_at>now() RETURNING user_id",
          [hash(v.token)],
        );
        if (!q.rowCount) throw Error("Tautan kedaluwarsa atau sudah dipakai.");
        await c.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [
          q.rows[0].user_id,
        ]);
      });
      return { redirect: "/app" };
    }
  }
  if (!u) throw Error("Silakan masuk terlebih dahulu.");
  await rateLimit(`commands:${u.id}`, 120, 60);
  switch (action) {
    case "resendVerify":
      if (!u.email_verified_at) {
        await rateLimit(`verify:${u.id}`, 3, 3600);
        await authToken(u.id, u.email, "verify");
      }
      return {
        message: "Email verifikasi dikirim jika akun belum terverifikasi.",
      };
    case "profile": {
      const v = strict({ name: z.string().trim().min(2).max(100) }).parse(
        input,
      );
      await db.query("UPDATE users SET name=$2 WHERE id=$1", [u.id, v.name]);
      break;
    }
    case "social": {
      const v = strict({
        platform: z.enum(["tiktok", "instagram"]),
        handle: z.string().regex(/^@?[a-zA-Z0-9._]{2,40}$/),
      }).parse(input);
      await db.query(
        "INSERT INTO social_accounts(user_id,platform,handle) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [u.id, v.platform, v.handle],
      );
      break;
    }
    case "destination": {
      const v = strict({
        bank: z.string().regex(/^[a-z0-9_]{2,30}$/),
        account: z.string().regex(/^\d{6,30}$/),
        holder: z.string().trim().min(3).max(100),
      }).parse(input);
      const banks = (process.env.FLIP_CHANNELS || "bca,bri,mandiri").split(",");
      if (!banks.includes(v.bank)) throw Error("Bank belum tersedia.");
      if (
        (
          await db.query(
            "SELECT count(*) FROM payment_destinations WHERE user_id=$1",
            [u.id],
          )
        ).rows[0].count >= 5
      )
        throw Error("Maksimal lima rekening.");
      await db.query(
        "INSERT INTO payment_destinations(user_id,bank_code,account_cipher,account_last4,holder) VALUES($1,$2,$3,$4,$5)",
        [u.id, v.bank, encrypt(v.account), v.account.slice(-4), v.holder],
      );
      break;
    }
    case "inspectDestination": {
      requireRole(u, ["finance", "superadmin"]);
      const v = strict({ id, reason }).parse(input);
      const q = await db.query(
        "SELECT * FROM payment_destinations WHERE id=$1",
        [v.id],
      );
      if (!q.rowCount) throw Error("Rekening tidak ditemukan.");
      await audit(db, u.id, "destination.inspected", v.id, {
        reason: v.reason,
      });
      const d = q.rows[0];
      return {
        destination: {
          bank: d.bank_code,
          account: decrypt(d.account_cipher),
          holder: d.holder,
        },
        message: "Akses rekening dicatat.",
      };
    }
    case "verifyDestination": {
      requireRole(u, ["finance", "superadmin"]);
      const v = strict({ id, approved: z.boolean(), reason }).parse(input);
      await tx(async (c) => {
        const q = await c.query(
          "UPDATE payment_destinations SET status=$2,verified_at=CASE WHEN $2='verified' THEN now() ELSE NULL END WHERE id=$1 AND status='pending' AND user_id<>$3 RETURNING id",
          [v.id, v.approved ? "verified" : "rejected", u.id],
        );
        if (!q.rowCount) throw Error("Rekening tidak dapat diproses.");
        await audit(c, u.id, "destination.reviewed", v.id, {
          approved: v.approved,
          reason: v.reason,
        });
      });
      break;
    }
    case "totpStart": {
      const v = strict({ password }).parse(input);
      await rateLimit(`totp-start:${u.id}`, 5, 900);
      const secret = await startTotp(u.id, v.password);
      return {
        secret,
        uri: `otpauth://totp/Sparksviu:${encodeURIComponent(u.email)}?secret=${secret}&issuer=Sparksviu`,
        message: "Simpan secret di aplikasi autentikator lalu konfirmasi kode.",
      };
    }
    case "totpConfirm": {
      const v = strict({ code: z.string().regex(/^\d{6}$/) }).parse(input);
      await rateLimit(`totp:${u.id}`, 8, 900);
      const token = await confirmTotp(u.id, v.code, await currentSessionHash());
      await setSessionCookie(token);
      break;
    }
    case "takeSlot": {
      const v = strict({ id, platform: z.enum(["tiktok", "instagram"]) }).parse(
        input,
      );
      await campaigns.takeSlot(u, v.id, v.platform);
      return { redirect: "/app/pekerjaan" };
    }
    case "submitPost": {
      const v = strict({
        id,
        url: z.url().max(500),
        note: z.string().max(2000).default(""),
      }).parse(input);
      await campaigns.submitPost(u, v.id, v.url, v.note);
      break;
    }
    case "reportViews": {
      const v = strict({
        id,
        views: z.number().int().min(0).max(100000000000),
        capturedAt: z.iso.datetime({ offset: true }),
        evidenceId: id,
      }).parse(input);
      await campaigns.reportViews(u, v.id, v.views, v.capturedAt, v.evidenceId);
      break;
    }
    case "dispute": {
      const v = strict({ id, reason }).parse(input);
      await campaigns.dispute(u, v.id, v.reason);
      break;
    }
    case "createCampaign":
      return campaigns.createCampaign(u, input);
    case "campaignStatus": {
      const v = strict({ id, status: z.string() }).parse(input);
      await campaigns.campaignStatus(u, v.id, v.status);
      break;
    }
    case "newRules": {
      const v = strict({ id, rules: rulesSchema }).parse(input);
      await campaigns.newRules(u, v.id, v.rules);
      break;
    }
    case "reviewPost": {
      const v = strict({
        id,
        decision: z.enum(["approved", "revision", "rejected"]),
        reason,
      }).parse(input);
      await campaigns.reviewPost(u, v.id, v.decision, v.reason);
      break;
    }
    case "assessViews": {
      const v = strict({ id, accepted: z.boolean(), reason }).parse(input);
      await campaigns.assessViews(u, v.id, v.accepted, v.reason);
      break;
    }
    case "proposeAssessment": {
      const v = strict({ id, snapshotId: id.nullable(), reason }).parse(input);
      await campaigns.proposeAssessment(u, v.id, v.snapshotId, v.reason);
      break;
    }
    case "resolveDispute": {
      const v = strict({ id, uphold: z.boolean(), reason }).parse(input);
      await campaigns.resolveDispute(u, v.id, v.uphold, v.reason);
      break;
    }
    case "payout": {
      const v = strict({
        destination: id,
        amount: z.number().int(),
        key: z.uuid(),
      }).parse(input);
      return payouts.requestPayout(u, v.destination, v.amount, v.key);
    }
    case "cancelPayout": {
      const v = strict({ id }).parse(input);
      await payouts.cancelRequested(u, v.id);
      break;
    }
    case "approveBatch": {
      const v = strict({ ids: z.array(id).min(1).max(100) }).parse(input);
      await payouts.approveBatch(u, v.ids);
      break;
    }
    case "reconcile": {
      const v = strict({ id }).parse(input);
      await payouts.reconcile(u, v.id);
      break;
    }
    case "readNotifications":
      await db.query(
        "UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL",
        [u.id],
      );
      break;
    case "staffRole": {
      requireRole(u, ["superadmin"]);
      const v = strict({
        id,
        role: z.enum(["participant", "ops", "reviewer", "finance"]),
        reason,
      }).parse(input);
      if (v.id === u.id) throw Error("Tidak dapat mengubah peran sendiri.");
      await tx(async (c) => {
        await c.query(
          "UPDATE users SET role=$2 WHERE id=$1 AND role<>'superadmin'",
          [v.id, v.role],
        );
        await c.query("DELETE FROM sessions WHERE user_id=$1", [v.id]);
        await audit(c, u.id, "staff.role.changed", v.id, {
          role: v.role,
          reason: v.reason,
        });
      });
      break;
    }
    default:
      throw Error("Aksi tidak dikenal.");
  }
  return { message: "Perubahan tersimpan." };
}
