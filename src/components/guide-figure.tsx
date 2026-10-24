"use client";
import { useState } from 'react';
export type Capture={file:string;width:number;height:number;marks:{x:number;y:number;lx:number;ly:number;label:string}[]};
export function GuideFigure({capture,caption}:{capture:Capture;caption:string}){
  const [large,setLarge]=useState(false);
  return <figure className="guide-figure"><div className={`guide-image-scroll ${large?'is-large':''}`}><div className="guide-image" style={{aspectRatio:`${capture.width}/${capture.height}`}}>
    {/* The SVG stays in screenshot coordinates, so arrows retain their targets when resized. */}
    <img src={`/panduan-images/${capture.file}`} alt={caption} width={capture.width} height={capture.height} loading="lazy"/>
    <svg viewBox={`0 0 ${capture.width} ${capture.height}`} aria-hidden="true">{capture.marks.map((m,i)=>{
      const dx=m.x-m.lx,dy=m.y-m.ly,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,tipX=m.x-ux*8,tipY=m.y-uy*8;
      const points=`${tipX},${tipY} ${tipX-ux*20-uy*10},${tipY-uy*20+ux*10} ${tipX-ux*20+uy*10},${tipY-uy*20-ux*10}`;
      return <g key={i}><line x1={m.lx} y1={m.ly} x2={tipX} y2={tipY} stroke="white" strokeWidth="11"/><line x1={m.lx} y1={m.ly} x2={tipX} y2={tipY} stroke="#b12c1d" strokeWidth="6"/><polygon points={points} fill="#b12c1d" stroke="white" strokeWidth="2"/><circle cx={m.lx} cy={m.ly} r="24" fill="#b12c1d" stroke="white" strokeWidth="4"/><text x={m.lx} y={m.ly+8} textAnchor="middle" fill="white" fontSize="24" fontWeight="800">{i+1}</text><circle cx={m.x} cy={m.y} r="7" fill="none" stroke="#b12c1d" strokeWidth="4"/></g>;
    })}</svg>
  </div></div><figcaption><strong>{caption}</strong><ol>{capture.marks.map((m,i)=><li key={i}>{m.label}</li>)}</ol><button aria-expanded={large} onClick={()=>setLarge(!large)}>{large?'Kembalikan ukuran':'Perbesar petunjuk'}</button></figcaption></figure>;
}
