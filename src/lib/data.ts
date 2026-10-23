import { db } from "./db";
import { currentUser, requireRole } from "./auth";
export async function publicCampaigns() {
  return (
    await db.query(
      "SELECT c.id,c.slug,c.title,c.brief,c.phase,c.platforms,c.status,c.quota,c.upload_deadline,c.cutoff_at,c.color,c.created_at,f.studio,f.genre,r.config AS rules,(SELECT count(*) FROM participations p WHERE p.campaign_id=c.id AND p.status NOT IN ('expired','rejected')) AS filled FROM campaigns c JOIN films f ON f.id=c.film_id JOIN campaign_rules r ON r.id=c.current_rule_id WHERE c.status<>'draft' ORDER BY c.created_at DESC LIMIT 100",
    )
  ).rows;
}
export async function pageData(path: string) {
  const user = await currentUser();
  const campaigns = await publicCampaigns();
  const base = {
    user,
    campaigns,
    registrationEnabled:
      process.env.REGISTRATION_ENABLED === "true" &&
      process.env.POLICIES_APPROVED === "true",
    banks: (process.env.FLIP_CHANNELS || "bca,bri,mandiri").split(","),
    supportEmail: process.env.SUPPORT_EMAIL || "",
    policiesApproved: process.env.POLICIES_APPROVED === "true",
    flipMode: process.env.FLIP_MODE || "disabled",
    minPayout: Number(process.env.MIN_PAYOUT_IDR || 50000),
    maxPayout: Number(process.env.MAX_DAILY_PAYOUT_IDR || 500000),
  };
  if (
    !path.startsWith("app") &&
    !path.startsWith("ops") &&
    !path.startsWith("finance")
  )
    return base;
  if (!user) return { ...base, requiresLogin: true };
  if (
    path.startsWith("ops") &&
    (!["ops", "reviewer", "superadmin"].includes(user.role) ||
      !user.totp_confirmed)
  )
    return {
      ...base,
      accessDenied: !user.totp_confirmed
        ? "Aktifkan autentikator di Profil untuk membuka dashboard staf."
        : "Peran akun tidak memiliki akses operasional.",
    };
  if (
    path.startsWith("finance") &&
    (!["finance", "superadmin"].includes(user.role) || !user.totp_confirmed)
  )
    return {
      ...base,
      accessDenied: !user.totp_confirmed
        ? "Aktifkan autentikator di Profil untuk membuka dashboard staf."
        : "Peran akun tidak memiliki akses finance.",
    };
  const [
    participations,
    submissions,
    wallet,
    destinations,
    social,
    notifications,
    payouts,
    entries,
  ] = await Promise.all([
    db.query(
      "SELECT p.*,c.title,c.slug,c.upload_deadline,c.cutoff_at,r.config AS rules FROM participations p JOIN campaigns c ON c.id=p.campaign_id JOIN campaign_rules r ON r.id=p.rule_id WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 100",
      [user.id],
    ),
    db.query(
      `SELECT s.*,c.title,c.cutoff_at,r.config AS rules,(SELECT jsonb_agg(e ORDER BY e.created_at) FROM (SELECT id,name,mime,size,created_at FROM evidence_files WHERE submission_id=s.id) e) AS evidence,(SELECT jsonb_agg(v ORDER BY v.created_at DESC) FROM view_snapshots v WHERE v.submission_id=s.id) AS snapshots,(SELECT jsonb_agg(d ORDER BY d.created_at DESC) FROM review_decisions d WHERE d.submission_id=s.id) AS decisions,(SELECT row_to_json(a) FROM assessments a WHERE a.submission_id=s.id AND a.status<>'void' LIMIT 1) AS assessment FROM submissions s JOIN campaigns c ON c.id=s.campaign_id JOIN participations p ON p.id=s.participation_id JOIN campaign_rules r ON r.id=p.rule_id WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT 100`,
      [user.id],
    ),
    db.query(
      "SELECT pending,available,held,paid FROM wallets WHERE user_id=$1",
      [user.id],
    ),
    db.query(
      "SELECT id,bank_code,account_last4,holder,status,verified_at,created_at FROM payment_destinations WHERE user_id=$1 ORDER BY created_at DESC",
      [user.id],
    ),
    db.query("SELECT * FROM social_accounts WHERE user_id=$1", [user.id]),
    db.query(
      "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",
      [user.id],
    ),
    db.query(
      "SELECT id,amount,status,destination_snapshot-'account_cipher' AS destination_snapshot,provider_id,failure_reason,created_at FROM payout_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [user.id],
    ),
    db.query(
      "SELECT j.id,j.kind,j.created_at,l.bucket,l.delta FROM journal_entries j JOIN journal_lines l ON l.entry_id=j.id WHERE j.user_id=$1 ORDER BY j.created_at DESC LIMIT 100",
      [user.id],
    ),
  ]);
  const assets = await db.query(
    "SELECT a.id,a.campaign_id,a.name,a.version,a.mime,a.size,a.embargo_at,a.rights_note FROM campaign_assets a WHERE EXISTS(SELECT 1 FROM participations p WHERE p.campaign_id=a.campaign_id AND p.user_id=$1 AND p.status NOT IN ('expired','rejected')) ORDER BY a.version DESC",
    [user.id],
  );
  const result = {
    ...base,
    participations: participations.rows,
    submissions: submissions.rows,
    wallet: wallet.rows[0] || { pending: 0, available: 0, held: 0, paid: 0 },
    destinations: destinations.rows,
    social: social.rows,
    notifications: notifications.rows,
    payouts: payouts.rows,
    entries: entries.rows,
    assets: assets.rows,
  };
  if (path.startsWith("ops")) {
    requireRole(user, ["ops", "reviewer", "superadmin"]);
    const canReview = ["reviewer", "superadmin"].includes(user.role);
    const allCampaigns = await db.query(
      "SELECT c.*,f.studio,f.genre,r.config AS rules FROM campaigns c JOIN films f ON f.id=c.film_id JOIN campaign_rules r ON r.id=c.current_rule_id ORDER BY created_at DESC LIMIT 200",
    );
    const reviewQueue = canReview
      ? await db.query(
          `SELECT s.*,u.name,c.title,c.cutoff_at,r.config AS rules,(SELECT jsonb_agg(e) FROM (SELECT id,name,created_at FROM evidence_files WHERE submission_id=s.id) e) AS evidence,(SELECT jsonb_agg(v ORDER BY created_at DESC) FROM view_snapshots v WHERE v.submission_id=s.id) AS snapshots,(SELECT row_to_json(a) FROM assessments a WHERE a.submission_id=s.id AND a.status<>'void' LIMIT 1) AS assessment FROM submissions s JOIN users u ON u.id=s.user_id JOIN campaigns c ON c.id=s.campaign_id JOIN participations p ON p.id=s.participation_id JOIN campaign_rules r ON r.id=p.rule_id WHERE s.status='submitted' OR (s.status='approved' AND NOT EXISTS(SELECT 1 FROM assessments active WHERE active.submission_id=s.id AND active.status<>'void')) ORDER BY CASE WHEN s.status='submitted' THEN 0 ELSE 1 END,c.cutoff_at,s.created_at LIMIT 200`,
        )
      : { rows: [] };
    const disputes = canReview
      ? await db.query(
          "SELECT d.*,u.name,c.title,a.accepted_views,a.amount FROM disputes d JOIN users u ON u.id=d.user_id JOIN assessments a ON a.id=d.assessment_id JOIN submissions s ON s.id=a.submission_id JOIN campaigns c ON c.id=s.campaign_id WHERE d.status='open' ORDER BY d.created_at LIMIT 100",
        )
      : { rows: [] };
    const users =
      user.role === "superadmin"
        ? await db.query(
            "SELECT id,name,email,role,totp_confirmed,created_at FROM users ORDER BY created_at DESC LIMIT 200",
          )
        : { rows: [] };
    const audits = await db.query(
      "SELECT action,object_id,created_at FROM audit_events ORDER BY created_at DESC LIMIT 100",
    );
    return {
      ...result,
      allCampaigns: allCampaigns.rows,
      reviewQueue: reviewQueue.rows,
      disputes: disputes.rows,
      users: users.rows,
      audits: audits.rows,
    };
  }
  if (path.startsWith("finance")) {
    requireRole(user, ["finance", "superadmin"]);
    const allPayouts = await db.query(
      "SELECT p.id,p.user_id,p.amount,p.status,p.provider_id,p.failure_reason,p.created_at,p.destination_snapshot-'account_cipher' AS destination_snapshot,u.name FROM payout_requests p JOIN users u ON u.id=p.user_id ORDER BY CASE p.status WHEN 'requested' THEN 0 WHEN 'needs_review' THEN 1 WHEN 'sending' THEN 2 WHEN 'pending' THEN 3 ELSE 4 END,p.created_at DESC LIMIT 200",
    );
    const pendingDestinations = await db.query(
      "SELECT d.id,d.user_id,d.bank_code,d.account_last4,d.holder,d.status,u.name FROM payment_destinations d JOIN users u ON u.id=d.user_id WHERE d.status='pending' ORDER BY d.created_at LIMIT 100",
    );
    const reconciliations = await db.query(
      "SELECT * FROM reconciliation_cases WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 100",
    );
    const totals = await db.query(
      "SELECT COALESCE(sum(pending),0) AS pending,COALESCE(sum(available),0) AS available,COALESCE(sum(held),0) AS held,COALESCE(sum(paid),0) AS paid FROM wallets",
    );
    return {
      ...result,
      allPayouts: allPayouts.rows,
      pendingDestinations: pendingDestinations.rows,
      reconciliations: reconciliations.rows,
      totals: totals.rows[0],
    };
  }
  return result;
}
