import { z } from 'zod';
import { currentUser, rateLimit } from '@/lib/auth';
import { assertOrigin, limitedBody } from '@/lib/http';
import { recordManualProof } from '@/lib/manual-payouts';
export const runtime = 'nodejs';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    assertOrigin(req);
    const user = await currentUser();
    if (!user) return Response.json({error:'Silakan masuk.'},{status:401});
    await rateLimit(`manual-proof:${user.id}`,20,3600);
    const id=z.uuid().parse((await params).id);
    const bytes=await limitedBody(req,5*1024*1024);
    const result=await recordManualProof(user,id,{
      reference:decodeURIComponent(req.headers.get('x-transfer-reference')||''),
      amount:Number(req.headers.get('x-transfer-amount')),
      paidAt:req.headers.get('x-paid-at'),
      note:decodeURIComponent(req.headers.get('x-transfer-note')||''),
    },bytes,decodeURIComponent(req.headers.get('x-file-name')||'Bukti transfer'));
    return Response.json(result);
  } catch(e) { return Response.json({error:e instanceof Error?e.message:'Bukti belum tersimpan.'},{status:400}); }
}
