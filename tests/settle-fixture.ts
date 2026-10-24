import { db } from '../src/lib/db';
import { settleDue } from '../src/lib/campaigns';
if(process.env.UAT_MODE!=='true'||!process.env.DATABASE_URL?.endsWith('/sv_uat_browser'))throw Error('Isolated UAT fixture only');
await settleDue();
await db.query("UPDATE settlements SET release_at=now()-interval '1 minute' WHERE released_at IS NULL");
await settleDue();
await db.end();
console.log('Fixture settlement and release completed; business time fast-forwarded only locally.');
