import { timingSafeEqual, createHash } from "node:crypto";
import { db, tx } from "@/lib/db";
import { limitedBody } from "@/lib/http";
import { flipParse, finalizePayout } from "@/lib/payouts";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    if (
      !["live", "sandbox"].includes(process.env.FLIP_MODE || "") ||
      !process.env.FLIP_CALLBACK_TOKEN
    )
      return new Response("Disabled", { status: 503 });
    const raw = (await limitedBody(req, 65536)).toString();
    const form = new URLSearchParams(raw);
    const provided = form.get("token") || "",
      expected = process.env.FLIP_CALLBACK_TOKEN;
    if (
      !provided ||
      !timingSafeEqual(
        createHash("sha256").update(provided).digest(),
        createHash("sha256").update(expected).digest(),
      )
    )
      return new Response("Unauthorized", { status: 401 });
    const data = flipParse(form.get("data") || "{}");
    const id = String(data.id || "");
    if (
      !/^\d{1,25}$/.test(id) ||
      !["DONE", "CANCELLED"].includes(String(data.status))
    )
      return new Response("Invalid", { status: 400 });
    const fingerprint = createHash("sha256")
      .update(
        `${id}:${data.status}:${data.amount}:${data.bank_code}:${data.account_number}`,
      )
      .digest("hex");
    const saved = {
      id,
      status: data.status,
      amount: data.amount,
      bank_code: data.bank_code,
      account_last4: String(data.account_number || "").slice(-4),
    };
    const inserted = await db.query(
      "INSERT INTO webhook_inbox(fingerprint,provider_id,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",
      [fingerprint, id, JSON.stringify(saved)],
    );
    if (inserted.rowCount) {
      await finalizePayout(id, data, "callback");
      await db.query(
        "UPDATE webhook_inbox SET status='processed' WHERE fingerprint=$1",
        [fingerprint],
      );
    } else {
      const pending = await db.query(
        "SELECT 1 FROM webhook_inbox WHERE fingerprint=$1 AND status='received'",
        [fingerprint],
      );
      if (pending.rowCount) {
        await finalizePayout(id, data, "callback-retry");
        await db.query(
          "UPDATE webhook_inbox SET status='processed' WHERE fingerprint=$1",
          [fingerprint],
        );
      }
    }
    return Response.json({ ok: true });
  } catch {
    return new Response("Retry later", { status: 503 });
  }
}
