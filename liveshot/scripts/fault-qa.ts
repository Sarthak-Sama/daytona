import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateReport } from '../lib/agent/report';
const base=process.env.BASE_URL||'http://127.0.0.1:4001';
async function main(){
 const saved=JSON.parse(await fs.readFile(path.resolve(process.env.LIVESHOT_DATA_DIR||'.data/qa-instance','store.json'),'utf8'));
 const captureId=saved.captures.at(-1)[0];
 const browser=await chromium.launch({headless:true});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1100}});const page=await context.newPage();let failed=false;
 await page.route('**/api/sessions/*/frame',async route=>{if(!failed){failed=true;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Injected first-frame failure'})});}else await route.continue();});
 await page.goto(`${base}/s/${captureId}`);await page.getByRole('button',{name:'Interact with this moment'}).click();
 const retry=page.getByRole('button',{name:'Retry · Wake my copy'});await retry.waitFor({timeout:30000});assert.ok(failed);await page.getByRole('img',{name:'The captured shop screen'}).waitFor();
 await retry.click();await page.getByRole('heading',{name:'The moment is yours.'}).waitFor({timeout:30000});
 assert.equal(await page.getByRole('button',{name:'Reset my copy'}).count(),1);await fs.mkdir('.data/qa',{recursive:true});await page.screenshot({path:'.data/qa/recovered-first-frame.png',fullPage:true});
 console.log('PASS first-frame failure returns STILL with retry; retry reaches LIVE.');
 const invalid=validateReport({title:'Probe',observedError:'',reproSteps:[],rootCause:'',evidence:[{step:1,excerpt:'   '}],suggestedFix:'',confidence:0,uncertainty:''},[{n:1,kind:'command',output:'real output'}]);
 assert.ok(invalid.errors.length);console.log('PASS whitespace-only evidence is rejected.');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
