import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3001',out='/scratch';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],results=[];
p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))errors.push('External URL');});
try{
 let count=0;
 for(const slug of ['mulai','kreator','reward-dan-pencairan','operasional','reviewer','finance-manual','superadmin']){
  assert.equal((await p.goto(base+'/panduan/'+slug)).status(),200);await p.locator('h1').waitFor();
  const figures=p.locator('.guide-figure');for(let i=0;i<await figures.count();i++){const f=figures.nth(i);await f.scrollIntoViewIfNeeded();await f.locator('img').evaluate(img=>img.decode());assert.ok(await f.locator('img').evaluate(img=>img.naturalWidth===1440));assert.ok(await f.locator('svg circle').count());count++;}
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);results.push('guide '+slug);
 }
 assert.equal(count,24);
 await p.goto(base+'/panduan');await p.getByLabel('Cari panduan').fill('pencairan');assert.ok(await p.locator('.guide-index a').count());await p.getByLabel('Cari panduan').fill('');
 await p.getByRole('button',{name:'Finance',exact:true}).click();assert.equal(await p.locator('.guide-index a').count(),1);results.push('search and role filter');
 await p.goto(base+'/panduan/finance-manual');await p.locator('#langkah-4 .guide-figure').scrollIntoViewIfNeeded();await p.screenshot({path:out+'/guide-annotated-desktop.png'});await p.getByRole('button',{name:'Perbesar petunjuk',exact:true}).nth(3).click();assert.equal(await p.locator('.is-large').count(),1);results.push('image enlargement');
 await p.setViewportSize({width:390,height:844});await p.goto(base+'/panduan/finance-manual');await p.locator('#langkah-4 .guide-figure').scrollIntoViewIfNeeded();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await p.screenshot({path:out+'/guide-annotated-mobile.png'});results.push('mobile layout');
 assert.equal((await p.goto(base+'/panduan/tidak-ada')).status(),404);assert.deepEqual(errors,[]);await writeFile(out+'/tutorial-results.json',JSON.stringify({passed:true,figures:count,results,errors},null,2));console.log(JSON.stringify({passed:true,figures:count,results}));
}catch(e){await writeFile(out+'/tutorial-results.json',JSON.stringify({passed:false,error:e.message,results,errors},null,2));console.error(e);process.exitCode=1;}finally{await browser.close();}
