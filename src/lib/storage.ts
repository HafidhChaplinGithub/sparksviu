import { mkdir, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
export const storageRoot = () =>
  path.resolve(process.env.STORAGE_DIR || "storage");
export function storagePath(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw Error("Kunci file tidak valid.");
  return path.join(storageRoot(), key);
}
export function fileMime(b: Buffer) {
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (
    b.length > 12 &&
    b.toString("ascii", 4, 8) === "ftyp" &&
    ["isom", "iso2", "mp41", "mp42", "avc1", "M4V "].includes(
      b.toString("ascii", 8, 12),
    )
  )
    return "video/mp4";
  throw Error("Format didukung: PNG, JPG, WebP, MP4.");
}
export async function storeFile(b: Buffer) {
  const key = randomUUID();
  await mkdir(storageRoot(), { recursive: true, mode: 0o700 });
  await writeFile(storagePath(key), b, { flag: "wx", mode: 0o600 });
  return key;
}
export async function removeFile(key: string) {
  await unlink(storagePath(key)).catch(() => {});
}
