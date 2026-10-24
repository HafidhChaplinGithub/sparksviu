import { z } from "zod";
export const money = (v: unknown) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(v || 0));
export const rulesSchema = z
  .object({
    model: z.enum(["CPM_LINEAR", "VIEW_TIER_HIGHEST", "FIXED_APPROVED"]),
    rate: z.number().int().min(0).max(100000000),
    minViews: z.number().int().min(0).max(1000000000),
    cap: z.number().int().min(1).max(100000000),
    tiers: z
      .array(
        z.object({
          views: z.number().int().positive().max(1000000000),
          amount: z.number().int().positive().max(100000000),
        }),
      )
      .max(20)
      .default([]),
  })
  .superRefine((v, c) => {
    if (
      v.model === "VIEW_TIER_HIGHEST" &&
      (!v.tiers.length ||
        v.tiers.some(
          (t, i) =>
            i > 0 &&
            (t.views <= v.tiers[i - 1].views ||
              t.amount <= v.tiers[i - 1].amount),
        ))
    )
      c.addIssue({
        code: "custom",
        message: "Tier harus berurutan naik, tanpa ambang atau nominal ganda.",
      });
    if (v.model !== "VIEW_TIER_HIGHEST" && v.rate < 1)
      c.addIssue({ code: "custom", message: "Tarif wajib positif." });
    if (
      v.model === "VIEW_TIER_HIGHEST" &&
      v.tiers.some((t) => t.amount > v.cap)
    )
      c.addIssue({ code: "custom", message: "Reward tier melebihi cap." });
    if (v.model === "FIXED_APPROVED" && v.rate > v.cap)
      c.addIssue({ code: "custom", message: "Tarif tetap melebihi cap." });
  });
export type Rules = z.infer<typeof rulesSchema>;
export function reward(raw: Rules, views: number): number {
  const r = rulesSchema.parse(raw);
  if (!Number.isSafeInteger(views) || views < 0)
    throw Error("Views tidak valid.");
  if (r.model === "FIXED_APPROVED") return r.rate;
  if (r.model === "VIEW_TIER_HIGHEST")
    return Math.min(
      r.cap,
      r.tiers.filter((t) => views >= t.views).at(-1)?.amount || 0,
    );
  if (views < r.minViews) return 0;
  return Number(
    (BigInt(views) * BigInt(r.rate)) / 1000n > BigInt(r.cap)
      ? BigInt(r.cap)
      : (BigInt(views) * BigInt(r.rate)) / 1000n,
  );
}
export function maxReward(r: Rules) {
  return r.model === "FIXED_APPROVED"
    ? r.rate
    : r.model === "VIEW_TIER_HIGHEST"
      ? Math.max(...r.tiers.map((t) => t.amount))
      : r.cap;
}
export function canonicalPost(input: string, platform: string) {
  const u = new URL(input);
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    throw Error("Gunakan URL HTTPS posting asli.");
  let key = "";
  if (
    platform === "tiktok" &&
    ["tiktok.com", "www.tiktok.com"].includes(u.hostname)
  ) {
    const m = u.pathname.match(/^\/@[A-Za-z0-9._]+\/video\/(\d{10,25})\/?$/);
    if (m) key = `tiktok:${m[1]}`;
  }
  if (
    platform === "instagram" &&
    ["instagram.com", "www.instagram.com"].includes(u.hostname)
  ) {
    const m = u.pathname.match(/^\/(?:reel|p)\/([A-Za-z0-9_-]{5,30})\/?$/);
    if (m) key = `instagram:${m[1]}`;
  }
  if (!key)
    throw Error(
      "Gunakan link posting TikTok atau Instagram lengkap, bukan shortlink.",
    );
  return { key, url: `https://${u.hostname}${u.pathname.replace(/\/$/, "")}/` };
}
export const labels: Record<string, string> = {
  open: "Dibuka",
  draft: "Draf",
  paused: "Dijeda",
  measuring: "Pengukuran",
  closed: "Selesai",
  reserved: "Slot diambil",
  submitted: "Menunggu review",
  revision: "Perlu revisi",
  approved: "Disetujui",
  rejected: "Ditolak",
  expired: "Kedaluwarsa",
  settled: "Reward final",
  requested: "Diajukan",
  sending: "Dikirim",
  pending: "Menunggu konfirmasi",
  succeeded: "Berhasil",
  failed: "Gagal",
  cancelled: "Dibatalkan",
  needs_review: "Perlu rekonsiliasi",
  manual_processing: 'Menunggu bukti transfer',
  manual_review: 'Menunggu petugas kedua',
  confirmed: 'Dikonfirmasi',
  verified: "Terverifikasi",
  reported: "Dilaporkan",
  accepted: "Diterima",
  proposed: "Masa keberatan",
  upheld: "Keputusan dipertahankan",
  revised: "Diperbaiki",
  CPM_LINEAR: "Per 1.000 views",
  VIEW_TIER_HIGHEST: "Bonus bertingkat",
  FIXED_APPROVED: "Tarif tetap",
};
export const date = (v: unknown) =>
  v
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(new Date(String(v)))
    : "—";
