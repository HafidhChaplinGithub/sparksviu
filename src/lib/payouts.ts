import { randomUUID } from "node:crypto";
import JSONbig from "json-bigint";
import { db, tx, audit, journal, notify } from "./db";
import { decrypt, requireRole, type User } from "./auth";
const json = JSONbig({
  storeAsString: true,
  strict: true,
  protoAction: "error",
  constructorAction: "error",
});
export function flipParse(text: string): Record<string, unknown> {
  return json.parse(text);
}
export async function requestPayout(
  user: User,
  destination: string,
  amount: number,
  key: string,
) {
  if (!user.email_verified_at) throw Error("Email belum terverifikasi.");
  return tx(async (c) => {
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
    const duplicate = await c.query(
      "SELECT id FROM payout_requests WHERE request_key=$1 AND user_id=$2",
      [key, user.id],
    );
    if (duplicate.rowCount) return duplicate.rows[0];
    const min = Number(process.env.MIN_PAYOUT_IDR || 50000),
      max = Number(process.env.MAX_DAILY_PAYOUT_IDR || 500000);
    if (!Number.isSafeInteger(amount) || amount < min || amount > max)
      throw Error("Nominal di luar batas pencairan.");
    const d = await c.query(
      "SELECT * FROM payment_destinations WHERE id=$1 AND user_id=$2 AND status='verified' AND verified_at<=now()-interval '24 hours'",
      [destination, user.id],
    );
    if (!d.rowCount)
      throw Error(
        "Rekening harus diverifikasi dan melewati masa tunggu 24 jam.",
      );
    const day = await c.query(
      "SELECT COALESCE(sum(amount),0) AS total FROM payout_requests WHERE user_id=$1 AND (created_at AT TIME ZONE 'Asia/Jakarta')::date=(now() AT TIME ZONE 'Asia/Jakarta')::date AND status NOT IN ('failed','cancelled')",
      [user.id],
    );
    if (Number(day.rows[0].total) + amount > max)
      throw Error("Batas pencairan harian tercapai.");
    const w = await c.query(
      "UPDATE wallets SET available=available-$2,held=held+$2 WHERE user_id=$1 AND available>=$2 RETURNING user_id",
      [user.id, amount],
    );
    if (!w.rowCount) throw Error("Saldo tersedia tidak cukup.");
    const row = d.rows[0],
      snap = {
        bank_code: row.bank_code,
        account_cipher: row.account_cipher,
        account_last4: row.account_last4,
        holder: row.holder,
      };
    const p = await c.query(
      "INSERT INTO payout_requests(user_id,destination_id,destination_snapshot,amount,request_key,provider_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
      [
        user.id,
        destination,
        JSON.stringify(snap),
        amount,
        key,
        `sv-${randomUUID()}`,
      ],
    );
    const id = p.rows[0].id;
    await journal(c, `payout-hold:${id}`, user.id, "payout.requested", id, {
      available: -amount,
      held: amount,
    });
    await audit(c, user.id, "payout.requested", id, { amount });
    return { id };
  });
}
export async function approveBatch(user: User, ids: string[]) {
  requireRole(user, ["finance", "superadmin"]);
  if (!ids.length || ids.length > 100) throw Error("Pilih 1–100 pengajuan.");
  if (process.env.FLIP_MODE !== "sandbox" && process.env.FLIP_MODE !== "live")
    throw Error("Integrasi Flip belum diaktifkan.");
  await tx(async (c) => {
    const batch = await c.query(
      "INSERT INTO payout_batches(approved_by) VALUES($1) RETURNING id",
      [user.id],
    );
    for (const id of [...new Set(ids)].sort()) {
      const p = await c.query(
        "UPDATE payout_requests SET status='approved',updated_at=now() WHERE id=$1 AND status='requested' AND user_id<>$2 RETURNING id",
        [id, user.id],
      );
      if (!p.rowCount)
        throw Error(
          "Pengajuan tidak dapat disetujui atau merupakan milik sendiri.",
        );
      await c.query(
        "INSERT INTO payout_batch_items(payout_id,batch_id) VALUES($1,$2)",
        [id, batch.rows[0].id],
      );
      await c.query(
        "INSERT INTO outbox(event_key,kind,payload) VALUES($1,'payout',$2)",
        [`payout:${id}`, JSON.stringify({ id })],
      );
      await audit(c, user.id, "payout.approved", id, {
        batch: batch.rows[0].id,
      });
    }
  });
}
export async function cancelRequested(user: User, id: string) {
  await tx(async (c) => {
    const q = await c.query(
      "SELECT * FROM payout_requests WHERE id=$1 AND user_id=$2 AND status='requested' FOR UPDATE",
      [id, user.id],
    );
    const p = q.rows[0];
    if (!p)
      throw Error("Hanya pengajuan yang belum disetujui dapat dibatalkan.");
    await c.query(
      "UPDATE payout_requests SET status='cancelled',updated_at=now() WHERE id=$1",
      [id],
    );
    await c.query(
      "UPDATE wallets SET held=held-$2,available=available+$2 WHERE user_id=$1",
      [user.id, p.amount],
    );
    await journal(c, `payout-cancel:${id}`, user.id, "payout.cancelled", id, {
      held: -Number(p.amount),
      available: Number(p.amount),
    });
    await audit(c, user.id, "payout.cancelled", id);
  });
}
export async function finalizePayout(
  providerId: string,
  data: Record<string, unknown>,
  source: string,
) {
  await tx(async (c) => {
    const q = await c.query(
      "SELECT * FROM payout_requests WHERE provider_id=$1 FOR UPDATE",
      [providerId],
    );
    const p = q.rows[0];
    if (!p) {
      await c.query(
        "INSERT INTO reconciliation_cases(provider_id,reason) VALUES($1,$2)",
        [providerId, "Callback tidak memiliki pengajuan yang cocok."],
      );
      return;
    }
    const snap = p.destination_snapshot;
    const match =
      Number(data.amount) === Number(p.amount) &&
      String(data.bank_code) === snap.bank_code &&
      String(data.account_number) === decrypt(snap.account_cipher);
    if (!match) {
      await c.query(
        "UPDATE payout_requests SET status='needs_review',updated_at=now() WHERE id=$1 AND status NOT IN ('succeeded','failed','cancelled')",
        [p.id],
      );
      await c.query(
        "INSERT INTO reconciliation_cases(payout_id,provider_id,reason) VALUES($1,$2,$3)",
        [p.id, providerId, "Nominal atau rekening respons Flip tidak sesuai."],
      );
      return;
    }
    const status = String(data.status);
    if (!["DONE", "CANCELLED"].includes(status)) return;
    if (["succeeded", "failed", "cancelled"].includes(p.status)) {
      if ((p.status === "succeeded") !== (status === "DONE"))
        await c.query(
          "INSERT INTO reconciliation_cases(payout_id,provider_id,reason) VALUES($1,$2,$3)",
          [
            p.id,
            providerId,
            "Status final bertentangan. Investigasi manual diperlukan.",
          ],
        );
      return;
    }
    const amount = Number(p.amount),
      done = status === "DONE";
    await c.query(
      "UPDATE wallets SET held=held-$2,available=available+$3,paid=paid+$4 WHERE user_id=$1",
      [p.user_id, amount, done ? 0 : amount, done ? amount : 0],
    );
    await journal(
      c,
      `payout-final:${p.id}`,
      p.user_id,
      done ? "payout.succeeded" : "payout.failed",
      p.id,
      done
        ? { held: -amount, paid: amount }
        : { held: -amount, available: amount },
    );
    await c.query(
      "UPDATE payout_requests SET status=$2,updated_at=now(),failure_reason=$3 WHERE id=$1",
      [
        p.id,
        done ? "succeeded" : "failed",
        done
          ? null
          : "Dibatalkan oleh Flip. Buat pengajuan baru setelah penyebab diselesaikan.",
      ],
    );
    await notify(
      c,
      p.user_id,
      done ? "Pencairan berhasil" : "Pencairan gagal",
      done
        ? "Dana telah dikonfirmasi Flip."
        : "Dana dikembalikan ke saldo tersedia.",
    );
    await audit(c, null, "payout.provider.final", p.id, { status, source });
  });
}
export async function flipRequest(
  path: string,
  method: string,
  body?: URLSearchParams,
  key?: string,
) {
  if (
    !["sandbox", "live"].includes(process.env.FLIP_MODE || "") ||
    !process.env.FLIP_API_KEY
  )
    throw Error("Flip dinonaktifkan.");
  const base =
    process.env.FLIP_MODE === "live"
      ? "https://bigflip.id/api"
      : "https://bigflip.id/big_sandbox_api";
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.FLIP_API_KEY}:`).toString("base64")}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    body,
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  const text = await response.text();
  if (text.length > 262144) throw Error("Respons Flip terlalu besar.");
  return { ok: response.ok, status: response.status, data: flipParse(text) };
}
export async function sendPayout(id: string) {
  const q = await db.query(
    "UPDATE payout_requests SET status='sending',updated_at=now() WHERE id=$1 AND status='approved' RETURNING *",
    [id],
  );
  const p = q.rows[0];
  if (!p) return;
  try {
    const d = p.destination_snapshot;
    const result = await flipRequest(
      "/v3/disbursement",
      "POST",
      new URLSearchParams({
        account_number: decrypt(d.account_cipher),
        bank_code: d.bank_code,
        amount: String(p.amount),
        remark: `Sparksviu ${id.slice(0, 8)}`,
      }),
      p.provider_key,
    );
    const providerId = String(result.data.id || "");
    if (!result.ok || !/^\d{1,25}$/.test(providerId))
      throw Error(
        `Flip HTTP ${result.status}; perlu pemeriksaan sebelum pengiriman ulang.`,
      );
    await db.query(
      "UPDATE payout_requests SET provider_id=$2,status='pending',updated_at=now() WHERE id=$1 AND status='sending'",
      [id, providerId],
    );
    await db.query(
      "INSERT INTO payout_attempts(payout_id,status,http_status) VALUES($1,'accepted',$2)",
      [id, result.status],
    );
    await finalizePayout(providerId, result.data, "create");
  } catch {
    await db.query(
      "UPDATE payout_requests SET status='needs_review',updated_at=now(),failure_reason='Hasil pengiriman belum pasti. Saldo tetap ditahan; lakukan rekonsiliasi.' WHERE id=$1 AND status='sending'",
      [id],
    );
    await db.query(
      "INSERT INTO payout_attempts(payout_id,status,note) VALUES($1,'uncertain','Periksa provider dengan idempotency key yang sama; jangan membuat transfer baru.')",
      [id],
    );
  }
}
export async function reconcile(user: User, id: string) {
  requireRole(user, ["finance", "superadmin"]);
  const q = await db.query(
    "SELECT * FROM payout_requests WHERE id=$1 AND status IN ('pending','needs_review','sending')",
    [id],
  );
  const p = q.rows[0];
  if (!p) throw Error("Pencairan tidak membutuhkan rekonsiliasi.");
  const r = await flipRequest(
    `/v3/get-disbursement?${p.provider_id ? `id=${encodeURIComponent(p.provider_id)}` : `idempotency-key=${encodeURIComponent(p.provider_key)}`}`,
    "GET",
  );
  if (!r.ok || !/^\d{1,25}$/.test(String(r.data.id || "")))
    throw Error("Provider belum mengonfirmasi transaksi. Saldo tetap ditahan.");
  await db.query(
    "UPDATE payout_requests SET provider_id=$2 WHERE id=$1 AND (provider_id IS NULL OR provider_id=$2)",
    [id, String(r.data.id)],
  );
  await finalizePayout(String(r.data.id), r.data, "reconcile");
  await audit(db, user.id, "payout.reconciled", id);
}
