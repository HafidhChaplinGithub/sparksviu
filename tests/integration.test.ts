import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  takeSlot,
  submitPost,
  reviewPost,
  reportViews,
  assessViews,
  proposeAssessment,
  settleDue,
  dispute,
} from "../src/lib/campaigns";
import {
  requestPayout,
  finalizePayout,
  cancelRequested,
  flipParse,
} from "../src/lib/payouts";
import { encrypt, type User } from "../src/lib/auth";
let admin: User,
  creator: User,
  other: User,
  campaign: string,
  destination: string,
  submission: string,
  assessment: string;
const user = async (email: string, role: string) => {
  const r = await db.query(
    "INSERT INTO users(email,name,password_hash,role,email_verified_at,totp_confirmed) VALUES($1,$1,'not-a-login',$2,now(),true) RETURNING *",
    [email, role],
  );
  return r.rows[0] as User;
};
before(async () => {
  if (!process.env.TEST_DATABASE_URL)
    throw Error("Set TEST_DATABASE_URL to a disposable isolated database.");
  if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL)
    throw Error("Test DB guard mismatch.");
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  process.env.PAYOUT_MODE='flip';
  for(const file of (await readdir('migrations')).filter(n=>n.endsWith('.sql')).sort())await db.query(await readFile(`migrations/${file}`,'utf8'));
  admin = await user("admin@example.test", "superadmin");
  creator = await user("creator@example.test", "participant");
  other = await user("other@example.test", "participant");
  for (const u of [creator, other]) {
    await db.query(
      "INSERT INTO social_accounts(user_id,platform,handle) VALUES($1,'tiktok','@test')",
      [u.id],
    );
    await db.query("INSERT INTO wallets(user_id) VALUES($1)", [u.id]);
  }
  const f = await db.query(
    "INSERT INTO films(title,studio,genre) VALUES('Film Test','Studio','Drama') RETURNING id",
  );
  const c = await db.query(
    "INSERT INTO campaigns(film_id,slug,title,brief,phase,platforms,status,quota,budget,upload_deadline,cutoff_at,created_by) VALUES($1,'test-film','Film Test','A genuine integration fixture brief.','Trailer',ARRAY['tiktok'],'open',1,100000,now()+interval '1 day',now()+interval '2 days',$2) RETURNING id",
    [f.rows[0].id, admin.id],
  );
  campaign = c.rows[0].id;
  const r = await db.query(
    "INSERT INTO campaign_rules(campaign_id,version,config) VALUES($1,1,$2) RETURNING id",
    [
      campaign,
      JSON.stringify({
        model: "CPM_LINEAR",
        rate: 2000,
        minViews: 5000,
        cap: 100000,
        tiers: [],
      }),
    ],
  );
  await db.query("UPDATE campaigns SET current_rule_id=$2 WHERE id=$1", [
    campaign,
    r.rows[0].id,
  ]);
});
after(async () => {
  await db.end();
});
test("concurrent slot requests cannot oversubscribe quota or budget", async () => {
  const r = await Promise.allSettled([
    takeSlot(creator, campaign, "tiktok"),
    takeSlot(other, campaign, "tiktok"),
  ]);
  assert.equal(r.filter((v) => v.status === "fulfilled").length, 1);
  const p = await db.query("SELECT * FROM participations");
  assert.equal(p.rowCount, 1);
  if (p.rows[0].user_id !== creator.id) [creator, other] = [other, creator];
  const c = await db.query("SELECT reserved,spent FROM campaigns WHERE id=$1", [
    campaign,
  ]);
  assert.equal(Number(c.rows[0].reserved), 100000);
});
test("ownership checks prevent cross-user submission; approved views alone do not credit balance", async () => {
  const p = (
    await db.query("SELECT id FROM participations WHERE user_id=$1", [
      creator.id,
    ])
  ).rows[0].id;
  await assert.rejects(() =>
    submitPost(
      other,
      p,
      "https://www.tiktok.com/@test/video/1234567890123456789",
      "wrong owner",
    ),
  );
  submission = (
    await submitPost(
      creator,
      p,
      "https://www.tiktok.com/@test/video/1234567890123456789?tracking=x",
      "original",
    )
  ).id;
  await reviewPost(
    admin,
    submission,
    "approved",
    "Ownership and campaign brief reviewed.",
  );
  const e = await db.query(
    "INSERT INTO evidence_files(submission_id,user_id,storage_key,name,mime,size) VALUES($1,$2,$3,'proof.png','image/png',100) RETURNING id",
    [submission, creator.id, randomUUID()],
  );
  await reportViews(
    creator,
    submission,
    40000,
    new Date().toISOString(),
    e.rows[0].id,
  );
  const snapshot = (
    await db.query("SELECT id FROM view_snapshots WHERE submission_id=$1", [
      submission,
    ])
  ).rows[0].id;
  await assessViews(
    admin,
    snapshot,
    true,
    "Evidence time and visible views reviewed.",
  );
  assert.equal(
    Number(
      (
        await db.query("SELECT available FROM wallets WHERE user_id=$1", [
          creator.id,
        ])
      ).rows[0].available,
    ),
    0,
  );
  await assert.rejects(() =>
    proposeAssessment(admin, submission, snapshot, "Too early assessment."),
  );
  await db.query(
    "UPDATE campaigns SET upload_deadline=now()-interval '1 hour',cutoff_at=now() WHERE id=$1",
    [campaign],
  );
  await proposeAssessment(
    admin,
    submission,
    snapshot,
    "Final cutoff evidence and views accepted.",
  );
  assessment = (
    await db.query("SELECT id FROM assessments WHERE submission_id=$1", [
      submission,
    ])
  ).rows[0].id;
});
test("an open dispute blocks settlement and creator cannot access another reward", async () => {
  await assert.rejects(() =>
    dispute(other, assessment, "Attempt to dispute another account."),
  );
  await dispute(
    creator,
    assessment,
    "Please verify the cutoff evidence again.",
  );
  await db.query(
    "UPDATE assessments SET objection_until=now()-interval '1 second' WHERE id=$1",
    [assessment],
  );
  await settleDue();
  assert.equal((await db.query("SELECT * FROM settlements")).rowCount, 0);
  await db.query(
    "UPDATE disputes SET status='upheld',resolution='Independently checked',resolved_by=$1 WHERE assessment_id=$2",
    [admin.id, assessment],
  );
  await settleDue();
  await settleDue();
  assert.equal((await db.query("SELECT * FROM settlements")).rowCount, 1);
  const w = (
    await db.query("SELECT * FROM wallets WHERE user_id=$1", [creator.id])
  ).rows[0];
  assert.equal(Number(w.pending), 80000);
  assert.equal(Number(w.available), 0);
  await db.query("UPDATE settlements SET release_at=now()-interval '1 second'");
  await settleDue();
  await settleDue();
  assert.equal(
    Number(
      (
        await db.query("SELECT available FROM wallets WHERE user_id=$1", [
          creator.id,
        ])
      ).rows[0].available,
    ),
    80000,
  );
});
test("payout destination hold, balance hold and duplicate request are enforced transactionally", async () => {
  const r = await db.query(
    "INSERT INTO payment_destinations(user_id,bank_code,account_cipher,account_last4,holder,status,verified_at) VALUES($1,'bca',$2,'7890','Test Creator','verified',now()) RETURNING id",
    [creator.id, encrypt("1234567890")],
  );
  destination = r.rows[0].id;
  await assert.rejects(() =>
    requestPayout(creator, destination, 50000, randomUUID()),
  );
  await db.query(
    "UPDATE payment_destinations SET verified_at=now()-interval '25 hours' WHERE id=$1",
    [destination],
  );
  const key = randomUUID();
  const [a, b] = await Promise.all([
    requestPayout(creator, destination, 50000, key),
    requestPayout(creator, destination, 50000, key),
  ]);
  assert.equal(a.id, b.id);
  const w = (
    await db.query("SELECT * FROM wallets WHERE user_id=$1", [creator.id])
  ).rows[0];
  assert.equal(Number(w.available), 30000);
  assert.equal(Number(w.held), 50000);
  await assert.rejects(() => cancelRequested(other, a.id));
  await cancelRequested(creator, a.id);
  assert.equal(
    Number(
      (
        await db.query("SELECT available FROM wallets WHERE user_id=$1", [
          creator.id,
        ])
      ).rows[0].available,
    ),
    80000,
  );
});
test("Flip 19-digit IDs, mismatches, duplicate callbacks and conflicting final statuses preserve money", async () => {
  assert.equal(
    flipParse('{"id":1234567890123456789}').id,
    "1234567890123456789",
  );
  const p = await requestPayout(creator, destination, 50000, randomUUID());
  await db.query(
    "UPDATE payout_requests SET status='pending',provider_id='1234567890123456789' WHERE id=$1",
    [p.id],
  );
  const data = {
    amount: 50001,
    bank_code: "bca",
    account_number: "1234567890",
    status: "DONE",
  };
  await finalizePayout("1234567890123456789", data, "test");
  assert.equal(
    (await db.query("SELECT status FROM payout_requests WHERE id=$1", [p.id]))
      .rows[0].status,
    "needs_review",
  );
  assert.equal(
    Number(
      (
        await db.query("SELECT held FROM wallets WHERE user_id=$1", [
          creator.id,
        ])
      ).rows[0].held,
    ),
    50000,
  );
  data.amount = 50000;
  await Promise.all([
    finalizePayout("1234567890123456789", data, "test"),
    finalizePayout("1234567890123456789", data, "test"),
  ]);
  await finalizePayout(
    "1234567890123456789",
    { ...data, status: "CANCELLED" },
    "test",
  );
  const w = (
    await db.query("SELECT * FROM wallets WHERE user_id=$1", [creator.id])
  ).rows[0];
  assert.equal(Number(w.paid), 50000);
  assert.equal(Number(w.available), 30000);
  assert.equal(Number(w.held), 0);
  const balance = await db.query(
    "SELECT entry_id,sum(delta) AS total FROM journal_lines GROUP BY entry_id HAVING sum(delta)<>0",
  );
  assert.equal(balance.rowCount, 0);
});

test("password revocation serializes with pending authentication", async () => {
  const { authenticate, passwordHash, hash } = await import("../src/lib/auth");
  const account = await user("revocation@example.test", "participant");
  await db.query(
    "UPDATE users SET password_hash=$2,totp_confirmed=false WHERE id=$1",
    [account.id, passwordHash("old-password-long-enough")],
  );
  const blocker = await db.connect();
  await blocker.query("BEGIN");
  await blocker.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
    account.id,
  ]);
  await blocker.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
    account.id,
    passwordHash("new-password-long-enough"),
  ]);
  await blocker.query("DELETE FROM sessions WHERE user_id=$1", [account.id]);
  const login = authenticate(account.email, "old-password-long-enough", "");
  const denied = assert.rejects(login, /tidak sesuai/);
  await new Promise((r) => setTimeout(r, 40));
  await blocker.query("COMMIT");
  blocker.release();
  await denied;
  assert.equal(
    (await db.query("SELECT 1 FROM sessions WHERE user_id=$1", [account.id]))
      .rowCount,
    0,
  );
  const token = await authenticate(
    account.email,
    "new-password-long-enough",
    "",
  );
  assert.equal(
    (await db.query("SELECT 1 FROM sessions WHERE id_hash=$1", [hash(token)]))
      .rowCount,
    1,
  );
});
test("factor confirmation revokes existing sessions and stale setup cannot replace the active factor", async () => {
  const { passwordHash, startTotp, confirmTotp, authenticate, totp, hash } =
    await import("../src/lib/auth");
  const account = await user("factor@example.test", "ops");
  await db.query(
    "UPDATE users SET password_hash=$2,totp_confirmed=false WHERE id=$1",
    [account.id, passwordHash("factor-password-long-enough")],
  );
  const old = await authenticate(
    account.email,
    "factor-password-long-enough",
    "",
  );
  const secret = await startTotp(account.id, "factor-password-long-enough");
  const next = await confirmTotp(
    account.id,
    totp(secret, Math.floor(Date.now() / 30000)),
    hash(old),
  );
  assert.equal(
    (await db.query("SELECT 1 FROM sessions WHERE id_hash=$1", [hash(old)]))
      .rowCount,
    0,
  );
  assert.equal(
    (await db.query("SELECT 1 FROM sessions WHERE id_hash=$1", [hash(next)]))
      .rowCount,
    1,
  );
  await assert.rejects(
    () => startTotp(account.id, "factor-password-long-enough"),
    /TOTP sudah aktif/,
  );
  await assert.rejects(
    () => authenticate(account.email, "factor-password-long-enough", ""),
    /tidak sesuai/,
  );
  const { decrypt } = await import("../src/lib/auth");
  assert.equal(
    decrypt(
      (
        await db.query("SELECT totp_secret FROM users WHERE id=$1", [
          account.id,
        ])
      ).rows[0].totp_secret,
    ),
    secret,
  );
});
test("a dispute committing while settlement waits on its assessment still blocks credit", async () => {
  const f = (
    await db.query("SELECT film_id FROM campaigns WHERE id=$1", [campaign])
  ).rows[0].film_id;
  const c = await db.query(
    "INSERT INTO campaigns(film_id,slug,title,brief,phase,platforms,status,quota,budget,reserved,upload_deadline,cutoff_at,created_by) VALUES($1,'dispute-race','Race Fixture','Fixture','Trailer',ARRAY['tiktok'],'measuring',1,20000,20000,now()-interval '2 days',now()-interval '1 day',$2) RETURNING id",
    [f, admin.id],
  );
  const cid = c.rows[0].id;
  const r = await db.query(
    "INSERT INTO campaign_rules(campaign_id,version,config) VALUES($1,1,$2) RETURNING id",
    [
      cid,
      JSON.stringify({
        model: "FIXED_APPROVED",
        rate: 20000,
        minViews: 0,
        cap: 20000,
        tiers: [],
      }),
    ],
  );
  await db.query("UPDATE campaigns SET current_rule_id=$2 WHERE id=$1", [
    cid,
    r.rows[0].id,
  ]);
  const p = await db.query(
    "INSERT INTO participations(campaign_id,user_id,rule_id,platform,status,reserve_amount,expires_at) VALUES($1,$2,$3,'tiktok','approved',20000,now()-interval '2 days') RETURNING id",
    [cid, creator.id, r.rows[0].id],
  );
  const s = await db.query(
    "INSERT INTO submissions(participation_id,user_id,campaign_id,platform,post_key,url,status) VALUES($1,$2,$3,'tiktok','tiktok:9999999999999999999','https://www.tiktok.com/@test/video/9999999999999999999/','approved') RETURNING id",
    [p.rows[0].id, creator.id, cid],
  );
  const a = await db.query(
    "INSERT INTO assessments(submission_id,reviewer_id,accepted_views,amount,objection_until,reason) VALUES($1,$2,0,20000,now()+interval '300 milliseconds','Race regression') RETURNING id",
    [s.rows[0].id, admin.id],
  );
  const aid = a.rows[0].id;
  const blocker = await db.connect();
  await blocker.query("BEGIN");
  const locked = await blocker.query(
    "SELECT * FROM assessments WHERE id=$1 FOR UPDATE",
    [aid],
  );
  assert.ok(new Date(locked.rows[0].objection_until) > new Date());
  await blocker.query(
    "INSERT INTO disputes(assessment_id,user_id,reason) VALUES($1,$2,'Valid objection entered before deadline')",
    [aid, creator.id],
  );
  await new Promise((r) => setTimeout(r, 350));
  const worker = settleDue();
  let waited = false;
  for (let i = 0; i < 50; i++) {
    const q = await db.query(
      "SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT a.*,s.user_id%' AND pid<>pg_backend_pid()",
    );
    if (q.rowCount) {
      waited = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(
    waited,
    true,
    "settlement reached the deterministic row-lock barrier",
  );
  await blocker.query("COMMIT");
  blocker.release();
  await worker;
  assert.equal(
    (await db.query("SELECT 1 FROM settlements WHERE assessment_id=$1", [aid]))
      .rowCount,
    0,
  );
  assert.equal(
    (await db.query("SELECT status FROM assessments WHERE id=$1", [aid]))
      .rows[0].status,
    "proposed",
  );
});

test("MFA confirmation cannot resurrect a session revoked while waiting for the account lock", async () => {
  const { passwordHash, startTotp, confirmTotp, authenticate, totp, hash } =
    await import("../src/lib/auth");
  const account = await user("factor-reset@example.test", "participant");
  await db.query(
    "UPDATE users SET password_hash=$2,totp_confirmed=false WHERE id=$1",
    [account.id, passwordHash("factor-old-password-12345")],
  );
  const old = await authenticate(
    account.email,
    "factor-old-password-12345",
    "",
  );
  const secret = await startTotp(account.id, "factor-old-password-12345");
  const reset = await db.connect();
  await reset.query("BEGIN");
  await reset.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
    account.id,
    passwordHash("factor-new-password-67890"),
  ]);
  await reset.query("DELETE FROM sessions WHERE user_id=$1", [account.id]);
  const pending = confirmTotp(
    account.id,
    totp(secret, Math.floor(Date.now() / 30000)),
    hash(old),
  );
  const denied = assert.rejects(pending, /Sesi telah dicabut/);
  await new Promise((r) => setTimeout(r, 40));
  await reset.query("COMMIT");
  reset.release();
  await denied;
  assert.equal(
    (await db.query("SELECT 1 FROM sessions WHERE user_id=$1", [account.id]))
      .rowCount,
    0,
  );
  assert.equal(
    (
      await db.query("SELECT totp_confirmed FROM users WHERE id=$1", [
        account.id,
      ])
    ).rows[0].totp_confirmed,
    false,
  );
});

test("uncertain transfer reconciliation uses the documented idempotency-key query and applies a matching result once", async () => {
  const { reconcile } = await import("../src/lib/payouts");
  await db.query("UPDATE wallets SET available=80000 WHERE user_id=$1", [
    creator.id,
  ]);
  const p = await requestPayout(creator, destination, 50000, randomUUID());
  await db.query(
    "UPDATE payout_requests SET status='needs_review' WHERE id=$1",
    [p.id],
  );
  const providerKey = (
    await db.query("SELECT provider_key FROM payout_requests WHERE id=$1", [
      p.id,
    ])
  ).rows[0].provider_key;
  const originalFetch = globalThis.fetch;
  process.env.FLIP_MODE = "sandbox";
  process.env.FLIP_API_KEY = "local-fixture-key";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://bigflip.id");
    assert.equal(url.pathname, "/big_sandbox_api/v3/get-disbursement");
    assert.equal(url.searchParams.get("idempotency-key"), providerKey);
    assert.equal(url.searchParams.has("idempotency_key"), false);
    assert.equal(init?.method, "GET");
    return new Response(
      JSON.stringify({
        id: "2234567890123456789",
        amount: 50000,
        status: "DONE",
        bank_code: "bca",
        account_number: "1234567890",
      }),
    );
  };
  try {
    await reconcile(admin, p.id);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FLIP_MODE;
    delete process.env.FLIP_API_KEY;
  }
  assert.equal(
    (await db.query("SELECT status FROM payout_requests WHERE id=$1", [p.id]))
      .rows[0].status,
    "succeeded",
  );
  assert.equal(
    Number(
      (
        await db.query("SELECT held FROM wallets WHERE user_id=$1", [
          creator.id,
        ])
      ).rows[0].held,
    ),
    0,
  );
});
test("worker dispatch binds form amount, destination and stable key; repeated dispatch and cancellation do not duplicate funds", async () => {
  const { approveBatch, sendPayout } = await import("../src/lib/payouts");
  await db.query("UPDATE wallets SET available=80000 WHERE user_id=$1", [
    creator.id,
  ]);
  const p = await requestPayout(creator, destination, 50000, randomUUID());
  const providerKey = (
    await db.query("SELECT provider_key FROM payout_requests WHERE id=$1", [
      p.id,
    ])
  ).rows[0].provider_key;
  const originalFetch = globalThis.fetch;
  process.env.FLIP_MODE = "sandbox";
  process.env.FLIP_API_KEY = "local-fixture-key";
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, "https://bigflip.id");
    assert.equal(url.pathname, "/big_sandbox_api/v3/disbursement");
    assert.equal(init?.method, "POST");
    assert.equal(
      new Headers(init?.headers).get("idempotency-key"),
      providerKey,
    );
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get("amount"), "50000");
    assert.equal(body.get("bank_code"), "bca");
    assert.equal(body.get("account_number"), "1234567890");
    return new Response(
      JSON.stringify({
        id: "3234567890123456789",
        amount: 50000,
        status: "PENDING",
        bank_code: "bca",
        account_number: "1234567890",
      }),
    );
  };
  try {
    await approveBatch(admin, [p.id]);
    await sendPayout(p.id);
    await sendPayout(p.id);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FLIP_MODE;
    delete process.env.FLIP_API_KEY;
  }
  assert.equal(calls, 1);
  assert.equal(
    (await db.query("SELECT status FROM payout_requests WHERE id=$1", [p.id]))
      .rows[0].status,
    "pending",
  );
  const data = {
    amount: 50000,
    status: "CANCELLED",
    bank_code: "bca",
    account_number: "1234567890",
  };
  await finalizePayout("3234567890123456789", data, "fixture");
  await finalizePayout("3234567890123456789", data, "fixture-repeat");
  const wallet = (
    await db.query("SELECT available,held FROM wallets WHERE user_id=$1", [
      creator.id,
    ])
  ).rows[0];
  assert.equal(Number(wallet.available), 80000);
  assert.equal(Number(wallet.held), 0);
});

test('manual payout holds funds, never creates a provider job, and needs a different confirmer', async () => {
  const {approveBatch,sendPayout}=await import('../src/lib/payouts');
  const {recordManualProof,reviewManualProof,inspectPayoutDestination}=await import('../src/lib/manual-payouts');
  process.env.PAYOUT_MODE='manual';process.env.FLIP_MODE='disabled';
  const owner=await user('manual-owner@example.test','participant');
  const clerk=await user('manual-clerk@example.test','finance');
  const checker=await user('manual-checker@example.test','finance');
  await db.query('INSERT INTO wallets(user_id,available) VALUES($1,150000)',[owner.id]);
  const d=await db.query("INSERT INTO payment_destinations(user_id,bank_code,account_cipher,account_last4,holder,status,verified_at) VALUES($1,'bca',$2,'0011','SIMULASI PEMILIK','verified',now()-interval '48 hours') RETURNING id",[owner.id,encrypt('0000000011')]);
  const p=await requestPayout(owner,d.rows[0].id,60000,randomUUID());
  await assert.rejects(()=>approveBatch(owner,[p.id]));
  await approveBatch(clerk,[p.id]);
  assert.equal((await db.query('SELECT status FROM payout_requests WHERE id=$1',[p.id])).rows[0].status,'manual_processing');
  assert.equal((await db.query("SELECT 1 FROM outbox WHERE event_key=$1",[`payout:${p.id}`])).rowCount,0);
  const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('manual must not use network')};
  try {await sendPayout(p.id);}finally{globalThis.fetch=oldFetch;}
  assert.equal((await inspectPayoutDestination(clerk,p.id,'Pencocokan fixture manual')).account,'0000000011');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1eEAAAAASUVORK5CYII=','base64');
  const input={reference:'TEST-MANUAL-ONE',amount:60000,paidAt:new Date().toISOString(),note:'SIMULASI: nominal dan rekening sudah cocok.'};
  await assert.rejects(()=>recordManualProof(owner,p.id,input,png,'SIMULASI.png'));
  await assert.rejects(()=>recordManualProof(clerk,p.id,{...input,amount:50000},png,'SIMULASI.png'));
  const results=await Promise.allSettled([recordManualProof(clerk,p.id,input,png,'SIMULASI.png'),recordManualProof(clerk,p.id,input,png,'SIMULASI.png')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const proof=(await db.query('SELECT id FROM manual_payout_proofs WHERE payout_id=$1',[p.id])).rows[0].id;
  await assert.rejects(()=>reviewManualProof(clerk,proof,true,'Tidak boleh menyetujui bukti sendiri.'));
  const done=await Promise.allSettled([reviewManualProof(checker,proof,true,'Fixture bank dan bukti sudah cocok.'),reviewManualProof(admin,proof,true,'Pemeriksa independen kedua pada balapan.')]);
  assert.equal(done.filter(r=>r.status==='fulfilled').length,1);
  const w=(await db.query('SELECT * FROM wallets WHERE user_id=$1',[owner.id])).rows[0];
  assert.equal(Number(w.available),90000);assert.equal(Number(w.held),0);assert.equal(Number(w.paid),60000);
  assert.equal((await db.query('SELECT 1 FROM journal_entries WHERE event_key=$1',[`payout-final:${p.id}`])).rowCount,1);
  await finalizePayout('9876543210999999999',{status:'DONE',amount:60000,bank_code:'bca',account_number:'0000000011'},'manual-isolation');
  assert.equal(Number((await db.query('SELECT paid FROM wallets WHERE user_id=$1',[owner.id])).rows[0].paid),60000);
});

test('rejected manual proof keeps the hold and permits correction with the same bank reference', async()=>{
  const {approveBatch}=await import('../src/lib/payouts');
  const {recordManualProof,reviewManualProof}=await import('../src/lib/manual-payouts');
  process.env.PAYOUT_MODE='manual';
  const owner=(await db.query("SELECT * FROM users WHERE email='manual-owner@example.test'")).rows[0] as User;
  const clerk=(await db.query("SELECT * FROM users WHERE email='manual-clerk@example.test'")).rows[0] as User;
  const checker=(await db.query("SELECT * FROM users WHERE email='manual-checker@example.test'")).rows[0] as User;
  const destination=(await db.query('SELECT id FROM payment_destinations WHERE user_id=$1',[owner.id])).rows[0].id;
  const p=await requestPayout(owner,destination,50000,randomUUID());await approveBatch(clerk,[p.id]);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1eEAAAAASUVORK5CYII=','base64');
  const input={reference:'TEST-CORRECTION',amount:50000,paidAt:new Date().toISOString(),note:'Bukti simulasi untuk pengujian koreksi.'};
  const first=await recordManualProof(clerk,p.id,input,png,'SIMULASI.png');
  await reviewManualProof(checker,first.id,false,'Gambar simulasi perlu diperjelas.');
  assert.equal(Number((await db.query('SELECT held FROM wallets WHERE user_id=$1',[owner.id])).rows[0].held),50000);
  const next=await recordManualProof(clerk,p.id,input,png,'SIMULASI-KOREKSI.png');
  await db.query("UPDATE users SET role='participant' WHERE id=$1",[checker.id]);
  await assert.rejects(()=>reviewManualProof(checker,next.id,true,'Snapshot peran lama tidak cukup.'));
  await db.query("UPDATE users SET role='finance' WHERE id=$1",[checker.id]);
  await reviewManualProof(checker,next.id,true,'Referensi sama, bukti koreksi sesuai.');
  assert.equal(Number((await db.query('SELECT paid FROM wallets WHERE user_id=$1',[owner.id])).rows[0].paid),110000);
  const another=await user('manual-duplicate-owner@example.test','participant');
  await db.query('INSERT INTO wallets(user_id,available) VALUES($1,100000)',[another.id]);
  const d=await db.query("INSERT INTO payment_destinations(user_id,bank_code,account_cipher,account_last4,holder,status,verified_at) VALUES($1,'bca',$2,'0022','SIMULASI DUA','verified',now()-interval '48 hours') RETURNING id",[another.id,encrypt('0000000022')]);
  const p2=await requestPayout(another,d.rows[0].id,50000,randomUUID());await approveBatch(clerk,[p2.id]);
  await assert.rejects(()=>recordManualProof(clerk,p2.id,{...input,reference:'test-correction',paidAt:new Date().toISOString()},png,'SIMULASI.png'));
});

test('UAT credentials cannot authenticate outside UAT or after expiry; provider is blocked in UAT',async()=>{
  const {authenticate,passwordHash}=await import('../src/lib/auth');
  const {flipRequest}=await import('../src/lib/payouts');
  const password='synthetic-UAT-password-12345';
  await db.query("INSERT INTO users(email,name,password_hash,is_demo,access_expires_at) VALUES('uat.expiry@example.test','SIMULASI EXPIRY',$1,true,now()+interval '1 hour')",[passwordHash(password)]);
  process.env.UAT_MODE='false';await assert.rejects(()=>authenticate('uat.expiry@example.test',password,''));
  process.env.UAT_MODE='true';assert.ok(await authenticate('uat.expiry@example.test',password,''));
  await db.query("UPDATE users SET access_expires_at=now()-interval '1 second' WHERE email='uat.expiry@example.test'");
  await assert.rejects(()=>authenticate('uat.expiry@example.test',password,''));
  process.env.FLIP_MODE='live';process.env.FLIP_API_KEY='dummy-test-only';
  await assert.rejects(()=>flipRequest('/v3/disbursement','POST'));
  process.env.UAT_MODE='false';process.env.FLIP_MODE='disabled';
});
