import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { currentUser, staffFactorSatisfied } from "@/lib/auth";
import { db } from "@/lib/db";
import { storagePath } from "@/lib/storage";
export const runtime = "nodejs";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const u = await currentUser();
  if (!u) return new NextResponse("Masuk terlebih dahulu.", { status: 401 });
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id))
    return new NextResponse("Tidak ditemukan", { status: 404 });
  const staff =
    ["ops", "reviewer", "superadmin"].includes(u.role) && staffFactorSatisfied(u);
  const finance = ['finance','superadmin'].includes(u.role) && staffFactorSatisfied(u);
  const r = await db.query(
    `SELECT e.storage_key,e.name,e.mime FROM evidence_files e WHERE e.id=$1 AND (e.user_id=$2 OR $3) UNION ALL SELECT a.storage_key,a.name,a.mime FROM campaign_assets a WHERE a.id=$1 AND ($3 OR (a.embargo_at<=now() AND EXISTS(SELECT 1 FROM participations p WHERE p.campaign_id=a.campaign_id AND p.user_id=$2 AND p.status NOT IN ('expired','rejected')))) UNION ALL SELECT m.storage_key,m.name,m.mime FROM manual_payout_proofs m JOIN payout_requests p ON p.id=m.payout_id WHERE m.id=$1 AND (p.user_id=$2 OR $4)`,
    [id, u.id, staff, finance],
  );
  if (!r.rowCount) return new NextResponse("Tidak ditemukan", { status: 404 });
  try {
    const row = r.rows[0],
      b = await readFile(storagePath(row.storage_key));
    return new NextResponse(b, {
      headers: {
        "Content-Type": row.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("File tidak tersedia", { status: 404 });
  }
}
