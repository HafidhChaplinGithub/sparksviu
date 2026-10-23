import nodemailer from "nodemailer";
import { db, tx } from "../src/lib/db";
import { settleDue } from "../src/lib/campaigns";
import { sendPayout, finalizePayout, flipRequest } from "../src/lib/payouts";
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
const smtp = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === "465",
      requireTLS: process.env.SMTP_PORT !== "465",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 10000,
      socketTimeout: 15000,
    })
  : null;
function payoutWindow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.find((p) => p.type === "weekday")!.value,
  );
  return (
    (process.env.PAYOUT_WEEKDAYS || "1,2,3,4,5")
      .split(",")
      .map(Number)
      .includes(day) &&
    Number(parts.find((p) => p.type === "hour")!.value) >=
      Number(process.env.PAYOUT_HOUR_WIB || 10)
  );
}
async function tick() {
  await settleDue();
  await db.query(
    "UPDATE payout_requests SET status='needs_review',failure_reason='Worker terhenti saat pengiriman; periksa transaksi dengan kunci yang sama.',updated_at=now() WHERE status='sending' AND updated_at<now()-interval '5 minutes'",
  );
  await db.query(
    "UPDATE outbox SET status='pending',claimed_at=NULL WHERE kind='email' AND status='processing' AND claimed_at<now()-interval '5 minutes'",
  );
  await db.query(
    "UPDATE outbox o SET status='pending',claimed_at=NULL WHERE o.kind='payout' AND o.status='processing' AND o.claimed_at<now()-interval '5 minutes' AND EXISTS(SELECT 1 FROM payout_requests p WHERE p.id=(o.payload->>'id')::uuid AND p.status='approved')",
  );
  const q = await tx(async (c) => {
    const r = await c.query(
      "SELECT * FROM outbox WHERE status='pending' AND available_at<=now() AND (kind<>'payout' OR $1) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 5",
      [payoutWindow()],
    );
    for (const e of r.rows)
      await c.query(
        "UPDATE outbox SET status='processing',claimed_at=now(),attempts=attempts+1 WHERE id=$1",
        [e.id],
      );
    return r.rows;
  });
  for (const e of q) {
    try {
      if (e.kind === "email") {
        if (!smtp || !process.env.SMTP_FROM)
          throw Error("SMTP belum dikonfigurasi");
        await smtp.sendMail({
          from: process.env.SMTP_FROM,
          to: e.payload.to,
          subject: e.payload.subject,
          text: e.payload.text,
        });
      } else if (e.kind === "payout") await sendPayout(e.payload.id);
      else throw Error("Jenis pekerjaan tidak dikenal");
      await db.query(
        "UPDATE outbox SET status='done',payload=CASE WHEN kind='email' THEN '{}'::jsonb ELSE payload END,last_error=NULL WHERE id=$1",
        [e.id],
      );
    } catch {
      await db.query(
        "UPDATE outbox SET status=CASE WHEN attempts>=8 THEN 'failed' ELSE 'pending' END,available_at=now()+interval '5 minutes',last_error='Pekerjaan belum selesai; periksa konfigurasi layanan.' WHERE id=$1",
        [e.id],
      );
    }
  }
  await db.query(
    "DELETE FROM sessions WHERE expires_at<now(); DELETE FROM auth_tokens WHERE expires_at<now(); DELETE FROM rate_limits WHERE expires_at<now()-interval '1 day'",
  );
}
console.log("Sparksviu worker started");
while (!stopping) {
  try {
    await tick();
  } catch (error) {
    console.error("Worker tick failed", {
      type: error instanceof Error ? error.name : "unknown",
    });
  }
  await new Promise((r) => setTimeout(r, 10000));
}
await db.end();
