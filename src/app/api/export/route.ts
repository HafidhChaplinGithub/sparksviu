import { currentUser, requireRole } from "@/lib/auth";
import { db, audit } from "@/lib/db";
export const dynamic = "force-dynamic";
function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[\s]*[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export async function GET() {
  try {
    const u = requireRole(await currentUser(), ["finance", "superadmin"]);
    const q = await db.query(
      "SELECT p.id,u.name,p.amount,p.status,p.provider_id,p.created_at FROM payout_requests p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 10000",
    );
    const lines = [
      ["ID", "Peserta", "Nominal IDR", "Status", "ID Flip", "Waktu"],
      ...q.rows.map((p) => [
        p.id,
        p.name,
        p.amount,
        p.status,
        p.provider_id,
        new Date(p.created_at).toISOString(),
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    await audit(db, u.id, "payout.exported", null, { count: q.rowCount });
    return new Response(`\uFEFF${lines}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="sparksviu-payouts.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Akses ditolak", { status: 403 });
  }
}
