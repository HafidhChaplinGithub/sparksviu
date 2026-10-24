"use client";
import Link from 'next/link';
import { useState } from 'react';
import { guides } from '@/lib/guides';
export function GuideLibrary(){
  const [role,setRole]=useState('Semua'),[query,setQuery]=useState('');
  const filtered=guides.filter(g=>(role==='Semua'||g.role===role)&&`${g.title} ${g.summary} ${g.role}`.toLowerCase().includes(query.toLowerCase()));
  return <><div className="guide-tools"><label htmlFor="guide-search">Cari panduan<input id="guide-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Contoh: bukti transfer, views, revisi"/></label><div className="guide-roles" aria-label="Filter peran">{['Semua','Kreator','Ops','Reviewer','Finance','Superadmin'].map(r=><button key={r} aria-pressed={role===r} onClick={()=>setRole(r)}>{r}</button>)}</div></div>
  <div className="guide-index">{filtered.map((g,i)=><Link className="guide-item" key={g.slug} href={`/panduan/${g.slug}`}><span className="guide-number">{String(i+1).padStart(2,'0')}</span><div><small>{g.role} · {g.minutes} menit</small><h2>{g.title}</h2><p>{g.summary}</p></div><span aria-hidden="true">→</span></Link>)}</div>{!filtered.length&&<p role="status">Tidak ada panduan untuk pencarian ini. Coba kata lain atau pilih Semua.</p>}</>;
}
