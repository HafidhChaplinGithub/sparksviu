export function assertOrigin(request: Request) {
  const configured = process.env.APP_URL;
  if (!configured) throw Error("APP_URL belum dikonfigurasi.");
  if (request.headers.get("origin") !== new URL(configured).origin)
    throw Error("Origin tidak diizinkan.");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none")
    throw Error("Permintaan lintas situs ditolak.");
}
export async function limitedBody(request: Request, max: number) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > max) throw Error("Permintaan terlalu besar.");
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > max) throw Error("Permintaan terlalu besar.");
      chunks.push(r.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
