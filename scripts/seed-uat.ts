import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { db, tx, journal, audit } from '../src/lib/db';
import { passwordHash, encrypt, newTotp } from '../src/lib/auth';
import { storageRoot } from '../src/lib/storage';

if (process.env.ALLOW_UAT_SEED !== 'true' || process.env.UAT_MODE !== 'true' || process.env.PAYOUT_MODE !== 'manual' || process.env.FLIP_MODE !== 'disabled' || process.env.SMTP_HOST || process.env.REGISTRATION_ENABLED === 'true')
  throw Error('Seed UAT hanya untuk database latihan khusus, dengan UAT_MODE=true, PAYOUT_MODE=manual, FLIP_MODE=disabled, tanpa SMTP/registrasi, dan ALLOW_UAT_SEED=true untuk proses ini.');
if (Buffer.from(process.env.ENCRYPTION_KEY||'','base64').length!==32) throw Error('Kunci enkripsi UAT belum valid.');
const file=path.join(storageRoot(),'uat-credentials.json');
const expiresAt=new Date(Date.now()+7*86400000).toISOString();
const specs=[['participant',5,'Kreator'],['ops',2,'Operasional'],['reviewer',2,'Reviewer'],['finance',2,'Finance'],['superadmin',2,'Administrator']] as const;
const users=specs.flatMap(([role,count,label])=>Array.from({length:count},(_,i)=>({
  id:randomUUID(),email:`uat.${role}${i+1}@example.test`,name:`${label} UAT ${i+1}`,role,
  password:randomBytes(24).toString('base64url'),totpSecret:role==='participant'?null:newTotp(),
})));
let createdFile=false;
try {
  await tx(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(193764202)');
    if ((await c.query('SELECT 1 FROM users WHERE NOT is_demo LIMIT 1')).rowCount || (await c.query('SELECT 1 FROM campaigns WHERE NOT is_demo LIMIT 1')).rowCount)
      throw Error('Database berisi identitas/kampanye operasional. Buat database UAT terpisah; seed tidak menimpa data itu.');
    const existing=await c.query("SELECT count(*) AS n FROM users WHERE email LIKE 'uat.%@example.test'");
    if(Number(existing.rows[0].n)) {
      const old=JSON.parse(await readFile(file,'utf8'));
      if(old.users?.length!==13 || Number(existing.rows[0].n)!==13)throw Error('Seed UAT tidak lengkap. Periksa fixture tanpa menimpa kredensial.');
      console.log('13 akun UAT sudah ada. Tidak ada password atau saldo yang diubah.');return;
    }
    for(const [i,u] of users.entries()) {
      await c.query('INSERT INTO users(id,email,name,password_hash,role,email_verified_at,totp_secret,totp_confirmed,is_demo,access_expires_at) VALUES($1,$2,$3,$4,$5,now(),$6,$7,true,$8)',[u.id,u.email,u.name,passwordHash(u.password),u.role,u.totpSecret?encrypt(u.totpSecret):null,!!u.totpSecret,expiresAt]);
      const amount=u.role==='participant'?250000:0;
      await c.query('INSERT INTO wallets(user_id,available) VALUES($1,$2)',[u.id,amount]);
      if(amount) await journal(c,`uat-opening:${u.id}`,u.id,'uat.opening',u.id,{available:amount,campaign:-amount});
      if(u.role==='participant') {
        await c.query("INSERT INTO social_accounts(user_id,platform,handle) VALUES($1,'tiktok',$2),($1,'instagram',$2)",[u.id,`@kreator_uat_${i+1}`]);
        const account=`0000000000${i+1}`;
        await c.query("INSERT INTO payment_destinations(user_id,bank_code,account_cipher,account_last4,holder,status,verified_at) VALUES($1,'bca',$2,$3,$4,'verified',now()-interval '48 hours')",[u.id,encrypt(account),account.slice(-4),`SIMULASI ${u.name}`]);
      }
      await audit(c,null,'uat.user.seeded',u.id,{role:u.role,expiresAt,synthetic:true});
    }
    const operator=users.find(u=>u.role==='ops')!;
    for(const [i,v] of [
      {title:'UAT — Jejak Cahaya',slug:'uat-jejak-cahaya',genre:'Drama',color:'#78416d',rules:{model:'CPM_LINEAR',rate:2000,minViews:5000,cap:100000,tiers:[]}},
      {title:'UAT — Pintu Selatan',slug:'uat-pintu-selatan',genre:'Misteri',color:'#832139',rules:{model:'VIEW_TIER_HIGHEST',rate:0,minViews:0,cap:150000,tiers:[{views:10000,amount:25000},{views:50000,amount:100000},{views:100000,amount:150000}]}},
      {title:'UAT — Jalan Pulang',slug:'uat-jalan-pulang',genre:'Keluarga',color:'#177965',rules:{model:'FIXED_APPROVED',rate:60000,minViews:0,cap:60000,tiers:[]}},
    ].entries()) {
      const film=await c.query('INSERT INTO films(title,studio,genre) VALUES($1,$2,$3) RETURNING id',[v.title,'Studio Simulasi — bukan film sungguhan',v.genre]);
      const camp=await c.query("INSERT INTO campaigns(film_id,slug,title,brief,phase,platforms,status,quota,budget,upload_deadline,cutoff_at,color,created_by,is_demo) VALUES($1,$2,$3,$4,'Trailer',ARRAY['tiktok','instagram'],'open',50,10000000,now()+interval '7 days',now()+interval '14 days',$5,$6,true) RETURNING id",[film.rows[0].id,v.slug,v.title,'SIMULASI UAT — bukan tawaran pekerjaan atau dana nyata. Buat contoh video reaksi orisinal 15–45 detik. Materi latihan tidak boleh dianggap film/studio sungguhan. Ikuti panduan promosi berbayar dan hindari spoiler.',v.color,operator.id]);
      const rule=await c.query('INSERT INTO campaign_rules(campaign_id,version,config) VALUES($1,1,$2) RETURNING id',[camp.rows[0].id,JSON.stringify(v.rules)]);
      await c.query('UPDATE campaigns SET current_rule_id=$2 WHERE id=$1',[camp.rows[0].id,rule.rows[0].id]);
      await audit(c,operator.id,'uat.campaign.seeded',camp.rows[0].id,{synthetic:true,order:i});
    }
    await mkdir(storageRoot(),{recursive:true,mode:0o700});
    await writeFile(file,JSON.stringify({warning:'RAHASIA — hanya untuk pemilik dan pengujian UAT. Jangan commit atau masukkan ke tutorial publik.',expiresAt,users},null,2)+'\n',{flag:'wx',mode:0o600});
    createdFile=true;
  });
  createdFile=false;
  console.log('Seed UAT siap: 5 kreator dan masing-masing 2 ops, reviewer, finance, superadmin. Kredensial privat: /app/storage/uat-credentials.json. Akun berlaku 7 hari; nominal/rekening seluruhnya simulasi.');
} catch(e) { if(createdFile)await unlink(file).catch(()=>{});throw e; }
finally { await db.end(); }
