"use client";
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { money, date } from '@/lib/domain';

type Proof = {id:string;reference:string;status:string;recorded_by:string;note:string;review_note?:string;paid_at:string};
type Payout = {id:string;user_id:string;name:string;amount:number;status:string;manual_proofs?:Proof[]};
export function ManualPayout({payout:p,actorId,uat}:{payout:Payout;actorId:string;uat:boolean}) {
  const router=useRouter();
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[detail,setDetail]=useState<{bank:string;account:string;holder:string}|null>(null);
  async function send(e:FormEvent<HTMLFormElement>,action:string,fixed:Record<string,unknown>={}) {
    e.preventDefault(); setBusy(true);setMessage('');
    try {
      const values={...Object.fromEntries(new FormData(e.currentTarget)),...fixed};
      const r=await fetch('/api/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data:values})});
      const data=await r.json();if(!r.ok)throw Error(data.error);
      if(data.destination)setDetail(data.destination);
      setMessage(data.message||'Pemeriksaan tersimpan.');router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:'Belum tersimpan.');}finally{setBusy(false);}
  }
  async function upload(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const form=new FormData(e.currentTarget),file=form.get('proof');
    if(!(file instanceof File)||!file.size)return;
    setBusy(true);setMessage('');
    try {
      const r=await fetch(`/api/manual-payout/${p.id}/proof`,{method:'POST',headers:{
        'x-file-name':encodeURIComponent(file.name),'x-transfer-reference':encodeURIComponent(String(form.get('reference'))),
        'x-transfer-amount':String(p.amount),'x-paid-at':new Date(String(form.get('paidAt'))).toISOString(),
        'x-transfer-note':encodeURIComponent(String(form.get('note'))),
      },body:file});
      const data=await r.json();if(!r.ok)throw Error(data.error);setMessage(data.message);router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:'Bukti belum tersimpan.');}finally{setBusy(false);}
  }
  return <article className="card manual-payout" data-payout-id={p.id}>
    <div className="card-head"><h3>{p.name} · {money(p.amount)}</h3><small>{p.id}</small></div>
    {uat&&<p className="banner warn">SIMULASI UAT — gunakan gambar bukti bertanda simulasi. Jangan mengirim uang ke rekening contoh.</p>}
    <p>Transfer dilakukan di aplikasi bank oleh petugas. Website mencatat bukti dan konfirmasi; tidak mengirim uang.</p>
    {p.user_id===actorId?<p>Petugas lain harus memproses pengajuan milikmu.</p>:<>
      <details><summary>Periksa tujuan transfer dari pengajuan</summary>
        <form onSubmit={e=>send(e,'inspectPayoutDestination',{id:p.id})} className="form">
          <label className="f"><span>Alasan pemeriksaan tujuan</span><input name="reason" minLength={10} maxLength={2000} required/></label>
          <button className="btn" disabled={busy}>Tampilkan tujuan pengajuan</button>
        </form>
        {detail&&<div className="banner warn"><b>{detail.bank.toUpperCase()} · {detail.account}</b><p>{detail.holder}</p><small>Tujuan dikunci saat pengajuan. Akses ini dicatat.</small></div>}
      </details>
      {p.status==='manual_processing'&&<form onSubmit={upload} className="form">
        <h4>Catat bukti setelah transfer</h4>
        <label className="f"><span>Referensi transfer unik</span><input name="reference" minLength={6} maxLength={100} required/></label>
        <label className="f"><span>Waktu transfer</span><input name="paidAt" type="datetime-local" required/></label>
        <label className="f"><span>Bukti transfer (PNG, JPG, WebP; maks. 5 MB)</span><input name="proof" type="file" accept="image/png,image/jpeg,image/webp" required/></label>
        <label className="f"><span>Catatan pencocokan nominal dan tujuan</span><textarea name="note" minLength={10} maxLength={2000} required/></label>
        <button className="btn btn-hot" disabled={busy}>Simpan bukti transfer</button>
        <small>Nominal yang dicatat: {money(p.amount)}. Saldo tetap ditahan sampai petugas kedua mengonfirmasi.</small>
      </form>}
      {(p.manual_proofs||[]).map(proof=><section key={proof.id} className="review-snapshot">
        <b>{proof.reference}</b><p>{date(proof.paid_at)} · {proof.status}</p>
        <a className="btn" href={`/api/files/${proof.id}`}>Unduh bukti transfer</a><p>{proof.note}</p>
        {proof.review_note&&<p>Hasil pemeriksaan: {proof.review_note}</p>}
        {proof.status==='submitted'&&(proof.recorded_by===actorId?<p>Menunggu konfirmasi petugas lain. Kamu tidak bisa menyetujui bukti sendiri.</p>:<form className="form" onSubmit={e=>{
          const approved=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='true';
          if(!window.confirm(approved?'Konfirmasi bahwa bukti, nominal, rekening tujuan, dan mutasi bank sesuai?':'Tolak bukti dan tetap tahan saldo untuk pemeriksaan?')){e.preventDefault();return;}
          void send(e,'reviewManualProof',{id:proof.id,approved});
        }}>
          <label className="f"><span>Hasil pemeriksaan bukti dan mutasi bank</span><textarea name="reason" minLength={10} maxLength={2000} required/></label>
          <div className="actions"><button className="btn btn-hot" value="true" disabled={busy}>Konfirmasi pembayaran manual</button><button className="btn" value="false" disabled={busy}>Tolak bukti, tetap tahan saldo</button></div>
        </form>)}
      </section>)}
    </>}
    {message&&<p role="status">{message}</p>}
  </article>;
}
