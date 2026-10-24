import { z } from 'zod';
import { tx, db, audit, journal, notify } from './db';
import { requireRole, requireCurrentFinance, decrypt, type User } from './auth';
import { storeFile, removeFile, fileMime } from './storage';

const metadata = z.object({
  reference: z.string().trim().min(6).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9 ./_-]+$/).transform(v=>v.toUpperCase().replace(/\s+/g,' ')),
  amount: z.number().int().positive().max(1000000000),
  paidAt: z.iso.datetime({ offset: true }),
  note: z.string().trim().min(10).max(2000),
}).strict();

export async function inspectPayoutDestination(user: User, id: string, reason: string) {
  requireRole(user, ['finance', 'superadmin']);
  const q = await db.query("SELECT id,user_id,method,status,destination_snapshot,amount FROM payout_requests WHERE id=$1", [id]);
  const p = q.rows[0];
  if (!p || p.user_id === user.id || p.method !== 'manual' || !['manual_processing','manual_review'].includes(p.status))
    throw Error('Tujuan transfer tidak tersedia untuk pemeriksaan ini.');
  await audit(db, user.id, 'payout.destination.inspected', id, { reason });
  const d = p.destination_snapshot;
  return { bank: d.bank_code, account: decrypt(d.account_cipher), holder: d.holder, amount: Number(p.amount) };
}

export async function recordManualProof(user: User, id: string, input: unknown, bytes: Buffer, name: string) {
  requireRole(user, ['finance', 'superadmin']);
  const v = metadata.parse(input);
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw Error('Bukti gambar maksimal 5 MB.');
  const mime = fileMime(bytes);
  if (!['image/png','image/jpeg','image/webp'].includes(mime)) throw Error('Gunakan bukti PNG, JPG, atau WebP.');
  let key: string | undefined;
  try {
    return await tx(async c => {
      await requireCurrentFinance(c,user);
      const q = await c.query('SELECT * FROM payout_requests WHERE id=$1 FOR UPDATE', [id]);
      const p = q.rows[0];
      if (!p || p.method !== 'manual' || p.status !== 'manual_processing' || p.user_id === user.id)
        throw Error('Pengajuan tidak dapat menerima bukti pembayaran.');
      if (Number(p.amount) !== v.amount) throw Error('Nominal harus sama persis dengan pengajuan.');
      const when = new Date(v.paidAt);
      if (when.getTime() > Date.now() + 60000 || when < new Date(p.created_at))
        throw Error('Waktu transfer harus setelah pengajuan dan tidak di masa depan.');
      await c.query('INSERT INTO manual_transfer_references(reference,payout_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[v.reference,id]);
      const ref=await c.query('SELECT payout_id FROM manual_transfer_references WHERE reference=$1',[v.reference]);
      if(ref.rows[0].payout_id!==id)throw Error('Referensi transfer sudah dipakai pengajuan lain.');
      key = await storeFile(bytes);
      const proof = await c.query('INSERT INTO manual_payout_proofs(payout_id,reference,amount,paid_at,recorded_by,storage_key,name,mime,size,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
        [id,v.reference,v.amount,v.paidAt,user.id,key,name.slice(0,150).replace(/[\x00-\x1f]/g,''),mime,bytes.length,v.note]);
      await c.query("UPDATE payout_requests SET status='manual_review',updated_at=now() WHERE id=$1",[id]);
      await audit(c,user.id,'payout.manual.proof',id,{ proof:proof.rows[0].id, reference:v.reference });
      return { id:proof.rows[0].id, message:'Bukti tersimpan. Petugas lain perlu memeriksanya sebelum saldo dinyatakan dibayar.' };
    });
  } catch (e) { if (key) await removeFile(key); throw e; }
}

export async function reviewManualProof(user: User, id: string, approved: boolean, reason: string) {
  requireRole(user,['finance','superadmin']);
  await tx(async c => {
    await requireCurrentFinance(c,user);
    const q = await c.query('SELECT p.*,m.id AS proof_id,m.recorded_by,m.status AS proof_status FROM manual_payout_proofs m JOIN payout_requests p ON p.id=m.payout_id WHERE m.id=$1 FOR UPDATE OF p,m',[id]);
    const p = q.rows[0];
    if (!p || p.method !== 'manual' || p.status !== 'manual_review' || p.proof_status !== 'submitted') throw Error('Bukti sudah diproses atau tidak tersedia.');
    if (p.recorded_by === user.id || p.user_id === user.id) throw Error('Konfirmasi wajib oleh petugas lain, bukan pengunggah atau penerima dana.');
    await c.query('UPDATE manual_payout_proofs SET status=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4 WHERE id=$1',[id,approved?'confirmed':'rejected',user.id,reason]);
    if (approved) {
      const amount = Number(p.amount);
      await c.query('UPDATE wallets SET held=held-$2,paid=paid+$2 WHERE user_id=$1',[p.user_id,amount]);
      await journal(c,`payout-final:${p.id}`,p.user_id,'payout.manual.succeeded',p.id,{held:-amount,paid:amount});
      await c.query("UPDATE payout_requests SET status='succeeded',updated_at=now(),failure_reason=NULL WHERE id=$1",[p.id]);
      await notify(c,p.user_id,'Pencairan manual dikonfirmasi','Bukti pembayaran sudah diperiksa petugas kedua. Lihat bukti pada riwayat pencairan.');
    } else {
      await c.query("UPDATE payout_requests SET status='manual_processing',updated_at=now(),failure_reason='Bukti perlu diperbaiki. Dana tetap ditahan; jangan transfer ulang sebelum investigasi.' WHERE id=$1",[p.id]);
    }
    await audit(c,user.id,'payout.manual.reviewed',p.id,{proof:id,approved,reason});
  });
}
