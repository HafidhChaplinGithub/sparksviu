import { z } from "zod";
import { tx, db, audit, notify, journal } from "./db";
import { requireRole, type User } from "./auth";
import { canonicalPost, rulesSchema, reward, maxReward } from "./domain";
import { uatMode } from './mode';
export const campaignSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    studio: z.string().trim().min(2).max(120),
    genre: z.string().trim().min(2).max(60),
    phase: z.string().trim().min(2).max(60),
    brief: z.string().trim().min(30).max(10000),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100),
    platforms: z
      .array(z.enum(["tiktok", "instagram"]))
      .min(1)
      .max(2),
    quota: z.number().int().min(1).max(100000),
    budget: z.number().int().positive().max(1000000000000),
    uploadDeadline: z.iso.datetime({ offset: true }),
    cutoffAt: z.iso.datetime({ offset: true }),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    rules: rulesSchema,
  })
  .refine(
    (v) =>
      new Date(v.cutoffAt) >= new Date(v.uploadDeadline) &&
      new Date(v.uploadDeadline) > new Date(),
    {
      message: "Tenggat harus di masa depan dan cutoff setelah tenggat unggah.",
    },
  )
  .refine((v) => v.budget >= maxReward(v.rules), {
    message: "Budget lebih kecil dari maksimum reward satu slot.",
  });
export async function createCampaign(user: User, data: unknown) {
  requireRole(user, ["ops", "superadmin"]);
  const v = campaignSchema.parse(data);
  return tx(async (c) => {
    const film = await c.query(
      "INSERT INTO films(title,studio,genre) VALUES($1,$2,$3) RETURNING id",
      [v.title, v.studio, v.genre],
    );
    const campaign = await c.query(
      "INSERT INTO campaigns(film_id,slug,title,brief,phase,platforms,quota,budget,upload_deadline,cutoff_at,color,created_by,is_demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",
      [
        film.rows[0].id,
        v.slug,
        v.title,
        v.brief,
        v.phase,
        [...new Set(v.platforms)],
        v.quota,
        v.budget,
        v.uploadDeadline,
        v.cutoffAt,
        v.color,
        user.id,
        uatMode(),
      ],
    );
    const id = campaign.rows[0].id;
    const rule = await c.query(
      "INSERT INTO campaign_rules(campaign_id,version,config) VALUES($1,1,$2) RETURNING id",
      [id, JSON.stringify(v.rules)],
    );
    await c.query("UPDATE campaigns SET current_rule_id=$2 WHERE id=$1", [
      id,
      rule.rows[0].id,
    ]);
    await audit(c, user.id, "campaign.created", id);
    return { id };
  });
}
export async function campaignStatus(user: User, id: string, status: string) {
  requireRole(user, ["ops", "superadmin"]);
  if (!["open", "paused", "measuring", "closed"].includes(status))
    throw Error("Status tidak valid.");
  await tx(async (c) => {
    const r = await c.query("SELECT * FROM campaigns WHERE id=$1 FOR UPDATE", [
      id,
    ]);
    const row = r.rows[0];
    if (!row) throw Error("Kampanye tidak ditemukan.");
    if (status === "open" && new Date(row.upload_deadline) <= new Date())
      throw Error("Tenggat kampanye sudah lewat.");
    if (
      status === "closed" &&
      (
        await c.query(
          "SELECT 1 FROM participations WHERE campaign_id=$1 AND status IN ('reserved','submitted','approved') LIMIT 1",
          [id],
        )
      ).rowCount
    )
      throw Error(
        "Selesaikan seluruh slot dan settlement sebelum menutup kampanye.",
      );
    await c.query("UPDATE campaigns SET status=$2 WHERE id=$1", [id, status]);
    await audit(c, user.id, "campaign.status", id, { status });
  });
}
export async function newRules(user: User, id: string, data: unknown) {
  requireRole(user, ["ops", "superadmin"]);
  const r = rulesSchema.parse(data);
  await tx(async (c) => {
    const q = await c.query("SELECT * FROM campaigns WHERE id=$1 FOR UPDATE", [
      id,
    ]);
    if (!q.rows[0] || q.rows[0].status === "closed")
      throw Error("Kampanye tidak bisa diubah.");
    const next = await c.query(
      "INSERT INTO campaign_rules(campaign_id,version,config) SELECT $1,COALESCE(max(version),0)+1,$2 FROM campaign_rules WHERE campaign_id=$1 RETURNING id",
      [id, JSON.stringify(r)],
    );
    await c.query("UPDATE campaigns SET current_rule_id=$2 WHERE id=$1", [
      id,
      next.rows[0].id,
    ]);
    await audit(c, user.id, "campaign.rules.versioned", id);
  });
}
export async function takeSlot(user: User, id: string, platform: string) {
  if (!user.email_verified_at)
    throw Error("Verifikasi email sebelum mengambil slot.");
  if (user.role !== "participant")
    throw Error("Gunakan akun kreator untuk mengambil slot.");
  return tx(async (c) => {
    const r = await c.query(
      "SELECT c.*,r.config FROM campaigns c JOIN campaign_rules r ON r.id=c.current_rule_id WHERE c.id=$1 FOR UPDATE OF c",
      [id],
    );
    const row = r.rows[0];
    if (
      !row ||
      row.is_demo !== uatMode() ||
      row.status !== "open" ||
      new Date(row.upload_deadline) <= new Date()
    )
      throw Error("Slot kampanye sudah ditutup.");
    if (!row.platforms.includes(platform))
      throw Error("Platform tidak tersedia.");
    if (
      !(
        await c.query(
          "SELECT 1 FROM social_accounts WHERE user_id=$1 AND platform=$2",
          [user.id, platform],
        )
      ).rowCount
    )
      throw Error(
        "Tambahkan akun sosial platform ini di Profil terlebih dahulu.",
      );
    const count = await c.query(
      "SELECT count(*) FROM participations WHERE campaign_id=$1 AND status NOT IN ('expired','rejected')",
      [id],
    );
    const amount = maxReward(rulesSchema.parse(row.config));
    if (
      Number(count.rows[0].count) >= row.quota ||
      Number(row.reserved) + Number(row.spent) + amount > Number(row.budget)
    )
      throw Error("Slot atau budget telah habis.");
    const p = await c.query(
      "INSERT INTO participations(campaign_id,user_id,rule_id,platform,reserve_amount,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
      [id, user.id, row.current_rule_id, platform, amount, row.upload_deadline],
    );
    await c.query("UPDATE campaigns SET reserved=reserved+$2 WHERE id=$1", [
      id,
      amount,
    ]);
    await audit(c, user.id, "participation.reserved", p.rows[0].id, { amount });
    return { id: p.rows[0].id };
  });
}
export async function submitPost(
  user: User,
  id: string,
  url: string,
  note: string,
) {
  return tx(async (c) => {
    const q = await c.query(
      "SELECT p.*,c.status AS campaign_status,c.cutoff_at FROM participations p JOIN campaigns c ON c.id=p.campaign_id WHERE p.id=$1 AND p.user_id=$2 FOR UPDATE OF p",
      [id, user.id],
    );
    const p = q.rows[0];
    if (
      !p ||
      !["reserved", "submitted"].includes(p.status) ||
      (p.status === "reserved"
        ? new Date(p.expires_at)
        : new Date(p.cutoff_at)) <= new Date()
    )
      throw Error("Slot tidak tersedia atau tenggat sudah lewat.");
    const post = canonicalPost(url, p.platform);
    const old = await c.query(
      "SELECT * FROM submissions WHERE participation_id=$1 FOR UPDATE",
      [id],
    );
    let sid: string;
    if (old.rows[0]) {
      if (old.rows[0].status !== "revision")
        throw Error("Posting sudah diajukan.");
      if (old.rows[0].post_key !== post.key)
        throw Error(
          "Revisi harus memakai posting asli yang sama. Hubungi reviewer jika posting perlu diganti.",
        );
      sid = old.rows[0].id;
      await c.query(
        "UPDATE submissions SET url=$2,status='submitted' WHERE id=$1",
        [sid, post.url],
      );
    } else {
      const s = await c.query(
        "INSERT INTO submissions(participation_id,user_id,campaign_id,platform,post_key,url) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        [id, user.id, p.campaign_id, p.platform, post.key, post.url],
      );
      sid = s.rows[0].id;
    }
    await c.query(
      "INSERT INTO submission_revisions(submission_id,url,note) VALUES($1,$2,$3)",
      [sid, post.url, note],
    );
    await c.query("UPDATE participations SET status='submitted' WHERE id=$1", [
      id,
    ]);
    await audit(c, user.id, "submission.submitted", sid);
    return { id: sid };
  });
}
export async function reviewPost(
  user: User,
  id: string,
  decision: string,
  reason: string,
) {
  requireRole(user, ["reviewer", "superadmin"]);
  if (
    !["approved", "revision", "rejected"].includes(decision) ||
    reason.length < 10
  )
    throw Error("Keputusan dan alasan minimal 10 karakter wajib diisi.");
  await tx(async (c) => {
    const q = await c.query(
      "SELECT s.*,p.reserve_amount FROM submissions s JOIN participations p ON p.id=s.participation_id WHERE s.id=$1 FOR UPDATE OF s,p",
      [id],
    );
    const s = q.rows[0];
    if (!s || s.status !== "submitted" || s.user_id === user.id)
      throw Error("Submission tidak dapat direview.");
    await c.query(
      "INSERT INTO review_decisions(submission_id,reviewer_id,decision,reason) VALUES($1,$2,$3,$4)",
      [id, user.id, decision, reason],
    );
    await c.query("UPDATE submissions SET status=$2 WHERE id=$1", [
      id,
      decision,
    ]);
    if (decision !== "revision")
      await c.query("UPDATE participations SET status=$2 WHERE id=$1", [
        s.participation_id,
        decision,
      ]);
    if (decision === "rejected")
      await c.query("UPDATE campaigns SET reserved=reserved-$2 WHERE id=$1", [
        s.campaign_id,
        s.reserve_amount,
      ]);
    await notify(
      c,
      s.user_id,
      "Hasil review posting",
      `${decision}: ${reason}`,
    );
    await audit(c, user.id, "submission.reviewed", id, { decision, reason });
  });
}
export async function reportViews(
  user: User,
  id: string,
  views: number,
  capturedAt: string,
  evidenceId: string,
) {
  await tx(async (c) => {
    const s = await c.query(
      "SELECT s.id,c.cutoff_at FROM submissions s JOIN campaigns c ON c.id=s.campaign_id WHERE s.id=$1 AND s.user_id=$2 AND s.status='approved' FOR UPDATE OF s",
      [id, user.id],
    );
    if (!s.rowCount) throw Error("Posting belum disetujui.");
    const at = new Date(capturedAt);
    if (
      at > new Date() ||
      at > new Date(s.rows[0].cutoff_at) ||
      at < new Date(Date.now() - 30 * 86400000)
    )
      throw Error(
        "Waktu bukti harus sebelum cutoff dan maksimal 30 hari terakhir.",
      );
    if (
      !(
        await c.query(
          "SELECT 1 FROM evidence_files WHERE id=$1 AND submission_id=$2 AND user_id=$3",
          [evidenceId, id, user.id],
        )
      ).rowCount
    )
      throw Error("Bukti tidak sesuai.");
    const count = await c.query(
      "SELECT count(*) FROM view_snapshots WHERE submission_id=$1",
      [id],
    );
    if (Number(count.rows[0].count) >= 100)
      throw Error("Batas 100 snapshot per posting tercapai. Hubungi reviewer.");
    await c.query(
      "INSERT INTO view_snapshots(submission_id,reported_by,views,captured_at,evidence_id) VALUES($1,$2,$3,$4,$5)",
      [id, user.id, views, at, evidenceId],
    );
    await audit(c, user.id, "views.reported", id, { views });
  });
}
export async function assessViews(
  user: User,
  id: string,
  accepted: boolean,
  reason: string,
) {
  requireRole(user, ["reviewer", "superadmin"]);
  await tx(async (c) => {
    const q = await c.query(
      "SELECT v.*,s.user_id,s.status AS submission_status,c.cutoff_at,r.config FROM view_snapshots v JOIN submissions s ON s.id=v.submission_id JOIN participations p ON p.id=s.participation_id JOIN campaign_rules r ON r.id=p.rule_id JOIN campaigns c ON c.id=s.campaign_id WHERE v.id=$1 FOR UPDATE OF v,s",
      [id],
    );
    const v = q.rows[0];
    if (
      !v ||
      v.status !== "reported" ||
      v.submission_status !== "approved" ||
      v.user_id === user.id
    )
      throw Error("Snapshot tidak dapat diproses.");
    await c.query(
      "UPDATE view_snapshots SET status=$2,accepted_by=$3,reason=$4 WHERE id=$1",
      [id, accepted ? "accepted" : "rejected", user.id, reason],
    );
    await audit(c, user.id, "views.reviewed", id, { accepted, reason });
  });
}
export async function proposeAssessment(
  user: User,
  id: string,
  snapshotId: string | null,
  reason: string,
) {
  requireRole(user, ["reviewer", "superadmin"]);
  await tx(async (c) => {
    const q = await c.query(
      "SELECT s.*,c.cutoff_at,p.rule_id,r.config FROM submissions s JOIN campaigns c ON c.id=s.campaign_id JOIN participations p ON p.id=s.participation_id JOIN campaign_rules r ON r.id=p.rule_id WHERE s.id=$1 FOR UPDATE OF s",
      [id],
    );
    const s = q.rows[0];
    if (
      !s ||
      s.status !== "approved" ||
      s.user_id === user.id ||
      new Date(s.cutoff_at) > new Date()
    )
      throw Error(
        "Finalisasi dilakukan setelah cutoff untuk posting yang disetujui.",
      );
    const rule = rulesSchema.parse(s.config);
    let views = 0;
    if (rule.model !== "FIXED_APPROVED") {
      const v = await c.query(
        "SELECT * FROM view_snapshots WHERE id=$1 AND submission_id=$2 AND status='accepted'",
        [snapshotId, id],
      );
      if (!v.rowCount) throw Error("Pilih snapshot views yang diterima.");
      const captured = new Date(v.rows[0].captured_at).getTime(),
        cutoff = new Date(s.cutoff_at).getTime();
      if (captured > cutoff || cutoff - captured > 3600000)
        throw Error(
          "Snapshot final harus dalam 60 menit sebelum cutoff. Jika bukti tidak ada, tahan penilaian untuk klarifikasi.",
        );
      views = Number(v.rows[0].views);
    }
    const amount = reward(rule, views);
    await c.query(
      "INSERT INTO assessments(submission_id,snapshot_id,reviewer_id,accepted_views,amount,objection_until,reason) VALUES($1,$2,$3,$4,$5,now()+interval '48 hours',$6)",
      [
        id,
        rule.model === "FIXED_APPROVED" ? null : snapshotId,
        user.id,
        views,
        amount,
        reason,
      ],
    );
    await notify(
      c,
      s.user_id,
      "Penilaian reward tersedia",
      `Reward Rp${amount}. Ajukan keberatan maksimal 48 jam dari penilaian.`,
    );
    await audit(c, user.id, "assessment.proposed", id, { views, amount });
  });
}
export async function dispute(user: User, id: string, reason: string) {
  await tx(async (c) => {
    const q = await c.query(
      "SELECT a.* FROM assessments a JOIN submissions s ON s.id=a.submission_id WHERE a.id=$1 AND s.user_id=$2 FOR UPDATE OF a",
      [id, user.id],
    );
    const a = q.rows[0];
    if (
      !a ||
      a.status !== "proposed" ||
      new Date(a.objection_until) <= new Date()
    )
      throw Error("Masa keberatan telah berakhir.");
    await c.query(
      "INSERT INTO disputes(assessment_id,user_id,reason) VALUES($1,$2,$3)",
      [id, user.id, reason],
    );
    await audit(c, user.id, "dispute.created", id);
  });
}
export async function resolveDispute(
  user: User,
  id: string,
  uphold: boolean,
  reason: string,
) {
  requireRole(user, ["reviewer", "superadmin"]);
  await tx(async (c) => {
    const q = await c.query(
      "SELECT d.*,a.submission_id,a.reviewer_id FROM disputes d JOIN assessments a ON a.id=d.assessment_id WHERE d.id=$1 FOR UPDATE OF d,a",
      [id],
    );
    const d = q.rows[0];
    if (
      !d ||
      d.status !== "open" ||
      d.user_id === user.id ||
      d.reviewer_id === user.id
    )
      throw Error("Keberatan harus ditangani reviewer lain.");
    await c.query(
      "UPDATE disputes SET status=$2,resolution=$3,resolved_by=$4 WHERE id=$1",
      [id, uphold ? "upheld" : "revised", reason, user.id],
    );
    if (!uphold) {
      await c.query("UPDATE assessments SET status='void' WHERE id=$1", [
        d.assessment_id,
      ]); /* Retain the void decision; a correction uses a separately audited workflow. */
    }
    await notify(c, d.user_id, "Keberatan ditangani", reason);
    await audit(c, user.id, "dispute.resolved", id, { uphold, reason });
  });
}
export async function settleDue() {
  const ids = await db.query(
    "SELECT a.id FROM assessments a WHERE a.status='proposed' AND a.objection_until<=now() AND NOT EXISTS(SELECT 1 FROM disputes d WHERE d.assessment_id=a.id AND d.status='open') LIMIT 100",
  );
  for (const { id } of ids.rows)
    await tx(async (c) => {
      const q = await c.query(
        "SELECT a.*,s.user_id,s.campaign_id,s.participation_id,p.reserve_amount FROM assessments a JOIN submissions s ON s.id=a.submission_id JOIN participations p ON p.id=s.participation_id WHERE a.id=$1 AND a.status='proposed' AND NOT EXISTS(SELECT 1 FROM disputes d WHERE d.assessment_id=a.id AND d.status='open') FOR UPDATE OF a,s,p",
        [id],
      );
      const a = q.rows[0];
      if (!a) return;
      // Refresh the dispute snapshot after any wait for the assessment lock.
      if (
        (
          await c.query(
            "SELECT 1 FROM disputes WHERE assessment_id=$1 AND status='open'",
            [id],
          )
        ).rowCount
      )
        return;
      const amount = Number(a.amount);
      if (amount > Number(a.reserve_amount))
        throw Error("Reward melebihi reservasi.");
      const settlement = await c.query(
        "INSERT INTO settlements(submission_id,assessment_id,user_id,amount,release_at) VALUES($1,$2,$3,$4,now()+interval '24 hours') RETURNING id",
        [a.submission_id, id, a.user_id, amount],
      );
      await c.query("UPDATE assessments SET status='settled' WHERE id=$1", [
        id,
      ]);
      await c.query("UPDATE submissions SET status='settled' WHERE id=$1", [
        a.submission_id,
      ]);
      await c.query("UPDATE participations SET status='settled' WHERE id=$1", [
        a.participation_id,
      ]);
      await c.query(
        "UPDATE campaigns SET reserved=reserved-$2,spent=spent+$3 WHERE id=$1",
        [a.campaign_id, a.reserve_amount, amount],
      );
      await c.query(
        "INSERT INTO wallets(user_id,pending) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET pending=wallets.pending+EXCLUDED.pending",
        [a.user_id, amount],
      );
      await journal(
        c,
        `settle:${id}`,
        a.user_id,
        "reward.settled",
        settlement.rows[0].id,
        { campaign: -amount, pending: amount },
      );
      await notify(
        c,
        a.user_id,
        "Reward final",
        "Reward masuk masa tunggu pencairan 24 jam.",
      );
    });
  const due = await db.query(
    "SELECT id FROM settlements WHERE released_at IS NULL AND release_at<=now() LIMIT 100",
  );
  for (const { id } of due.rows)
    await tx(async (c) => {
      const q = await c.query(
        "SELECT * FROM settlements WHERE id=$1 AND released_at IS NULL FOR UPDATE",
        [id],
      );
      const s = q.rows[0];
      if (!s) return;
      await c.query(
        "UPDATE wallets SET pending=pending-$2,available=available+$2 WHERE user_id=$1",
        [s.user_id, s.amount],
      );
      await journal(c, `release:${id}`, s.user_id, "reward.released", id, {
        pending: -Number(s.amount),
        available: Number(s.amount),
      });
      await c.query("UPDATE settlements SET released_at=now() WHERE id=$1", [
        id,
      ]);
    });
  const expired = await db.query(
    "SELECT id FROM participations WHERE status='reserved' AND expires_at<now() LIMIT 100",
  );
  for (const { id } of expired.rows)
    await tx(async (c) => {
      const q = await c.query(
        "UPDATE participations SET status='expired' WHERE id=$1 AND status='reserved' RETURNING campaign_id,reserve_amount",
        [id],
      );
      if (q.rowCount)
        await c.query("UPDATE campaigns SET reserved=reserved-$2 WHERE id=$1", [
          q.rows[0].campaign_id,
          q.rows[0].reserve_amount,
        ]);
    });
}
