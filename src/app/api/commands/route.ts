import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { command } from "@/lib/commands";
import { assertOrigin, limitedBody } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return NextResponse.json({ error: "Gunakan JSON." }, { status: 415 });
    const body = JSON.parse((await limitedBody(request, 65536)).toString());
    if (typeof body.action !== "string") throw Error("Aksi tidak valid.");
    const result = await command(body.action, body.data);
    return NextResponse.json(result ?? { message: "Tersimpan." }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof ZodError)
      return NextResponse.json(
        { error: e.issues.map((i) => i.message).join(" ") },
        { status: 400 },
      );
    const message = e instanceof Error ? e.message : "";
    const sql = e as { code?: string };
    if (sql.code === "23505")
      return NextResponse.json(
        { error: "Data sudah terdaftar atau pengajuan sudah diproses." },
        { status: 409 },
      );
    if (
      sql.code ||
      !message ||
      message.includes("connect") ||
      message.includes("SQL")
    ) {
      console.error("Command failed", { code: sql.code || "internal" });
      return NextResponse.json(
        {
          error: "Layanan belum tersedia. Coba kembali atau hubungi pengelola.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
