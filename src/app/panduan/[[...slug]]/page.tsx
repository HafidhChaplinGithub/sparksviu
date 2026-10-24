import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guides } from '@/lib/guides';
import captures from '@/lib/guide-captures.json';
import { GuideLibrary } from '@/components/guide-library';
import { GuideFigure, type Capture } from '@/components/guide-figure';
import './guide.css';
export const metadata={title:'Panduan penggunaan | Sparksviu',description:'Tutorial bergambar untuk kreator, ops, reviewer, finance, dan superadmin Sparksviu.'};
export default async function GuidePage({params}:{params:Promise<{slug?:string[]}>}){
  const {slug=[]}=await params;
  const guide=slug.length===1?guides.find(g=>g.slug===slug[0]):undefined;
  if(slug.length&&!guide)notFound();
  return <div className="guide-site"><header className="guide-header"><Link href="/" className="guide-brand">sparksviu<span>✳</span></Link><nav aria-label="Navigasi panduan"><Link href="/panduan">Semua panduan</Link><Link href="/app">Buka aplikasi</Link></nav></header>
    <main className="guide-main" id="main">{!guide?<><div className="guide-intro"><p>Panduan penggunaan Sparksviu</p><h1>Kenali alurnya.<br/>Kerjakan dengan jelas.</h1><p>Tutorial untuk setiap peran, dari mengambil kampanye sampai mencatat pembayaran. Angka dan panah pada gambar menunjukkan bagian yang perlu diklik.</p></div><GuideLibrary/><aside className="guide-note">Seluruh gambar berasal dari lingkungan UAT dengan data sintetis. Tidak ada transfer uang nyata dalam tutorial. Password, kode autentikator, dan data bank pribadi tidak ditampilkan.</aside></>:<>
      <div className="guide-article-top"><Link href="/panduan">← Semua panduan</Link><p>{guide.role} · sekitar {guide.minutes} menit</p><h1>{guide.title}</h1><p>{guide.summary}</p></div>
      <div className="guide-article-layout"><aside className="guide-toc"><b>Di panduan ini</b><ol>{guide.steps.map((s,i)=><li key={s.title}><a href={`#langkah-${i+1}`}>{s.title}</a></li>)}</ol><Link href="/panduan">Pilih panduan lain</Link></aside><article className="guide-article">{guide.steps.map((s,i)=>{
        const capture=s.screen?(captures as Record<string,Capture>)[s.screen]:null;
        return <section id={`langkah-${i+1}`} key={s.title} className="guide-step"><span className="guide-step-number">{String(i+1).padStart(2,'0')}</span><h2>{s.title}</h2><p>{s.body}</p>{s.checks&&<ul>{s.checks.map(c=><li key={c}>{c}</li>)}</ul>}{capture&&<GuideFigure capture={capture} caption={s.title}/>}</section>;
      })}<div className="guide-note">Jika tampilan atau status berbeda, baca pesan di aplikasi terlebih dahulu. Jangan mengulang transfer hanya karena bukti belum terkonfirmasi. Hubungi pengelola untuk koreksi yang membutuhkan pemeriksaan.</div><Link href="/panduan" className="guide-back">Kembali ke daftar panduan</Link></article></div>
    </>}</main><footer className="guide-footer"><span>Sparksviu · Panduan tim dan kreator</span><Link href="/bantuan">Pusat bantuan</Link></footer></div>;
}
