import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, requireRole, rateLimit } from "@/lib/auth";
import { tx, audit } from "@/lib/db";
import { assertOrigin, limitedBody } from "@/lib/http";
import { fileMime, storeFile, removeFile } from "@/lib/storage";
export const runtime = "nodejs";
export async function POST(req: Request) {
  let key: string | undefined;
  try {
    assertOrigin(req);
    const u = await currentUser();
    if (!u) throw Error("Silakan masuk.");
    await rateLimit(`upload:${u.id}`, 20, 3600);
    const target = z.uuid().parse(req.headers.get("x-target-id"));
    const kind = z
      .enum(["evidence", "asset"])
      .parse(req.headers.get("x-file-kind"));
    const name = decodeURIComponent(req.headers.get("x-file-name") || "Bukti")
      .slice(0, 150)
      .replace(/[\r\n\x00-\x1f]/g, "");
    const b = await limitedBody(req, 20 * 1024 * 1024);
    if (!b.length) throw Error("File kosong.");
    const mime = fileMime(b);
    const embargo = req.headers.get("x-embargo-at");
    const rights = decodeURIComponent(
      req.headers.get("x-rights-note") || "",
    ).slice(0, 1000);
    if (kind === "asset") {
      requireRole(u, ["ops", "superadmin"]);
      if (
        !embargo ||
        !Number.isFinite(Date.parse(embargo)) ||
        rights.length < 10
      )
        throw Error("Embargo dan hak penggunaan wajib diisi.");
    }
    const id = await tx(async (c) => {
      if (kind === "evidence") {
        const s = await c.query(
          "SELECT id FROM submissions WHERE id=$1 AND user_id=$2 AND status IN ('submitted','revision','approved') FOR UPDATE",
          [target, u.id],
        );
        if (!s.rowCount) throw Error("Submission tidak dapat menerima bukti.");
        const n = await c.query(
          "SELECT count(*) FROM evidence_files WHERE submission_id=$1",
          [target],
        );
        if (Number(n.rows[0].count) >= 3)
          throw Error("Maksimal tiga bukti per posting.");
        key = await storeFile(b);
        const r = await c.query(
          "INSERT INTO evidence_files(submission_id,user_id,storage_key,name,mime,size) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
          [target, u.id, key, name, mime, b.length],
        );
        await audit(c, u.id, "evidence.uploaded", r.rows[0].id);
        return r.rows[0].id;
      }
      const s = await c.query(
        "SELECT id FROM campaigns WHERE id=$1 FOR UPDATE",
        [target],
      );
      if (!s.rowCount) throw Error("Kampanye tidak ditemukan.");
      key = await storeFile(b);
      const r = await c.query(
        "INSERT INTO campaign_assets(campaign_id,version,name,storage_key,mime,size,embargo_at,rights_note) SELECT $1,COALESCE(max(version),0)+1,$2,$3,$4,$5,$6,$7 FROM campaign_assets WHERE campaign_id=$1 RETURNING id",
        [target, name, key, mime, b.length, embargo, rights],
      );
      await audit(c, u.id, "asset.uploaded", r.rows[0].id);
      return r.rows[0].id;
    });
    return NextResponse.json({ id, message: "File tersimpan." });
  } catch {
    if (key) await removeFile(key);
    return NextResponse.json(
      {
        error:
          "Unggah gagal. Periksa hak akses, batas tiga bukti, ukuran 20 MB, dan format file.",
      },
      { status: 400 },
    );
  }
}
