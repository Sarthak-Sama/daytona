/** Records an honest, uncut local product walkthrough; only reference-shop layout reads supply coordinates. */
import assert from 'node:assert/strict';
import { chromium, type Page } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
const base=process.env.BASE_URL||'http://127.0.0.1:4002';
const data=path.resolve(process.env.LIVESHOT_DATA_DIR||'.data/recording-runtime');
const out=path.resolve('.data/demo-recording');
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const chapters:{title:string;at:number;clip:number}[]=[];
const checks:string[]=[];let clip=1,clipStart=0;
async function eventually(fn:()=>Promise<boolean>,message:string,ms=30000){const end=Date.now()+ms;while(Date.now()<end){if(await fn().catch(()=>false))return;await pause(100);}throw Error(message);}
async function json(route:string,init?:RequestInit){const r=await fetch(base+route,init);const s=await r.text();assert.ok(r.ok,s);assert.ok(!/sandboxId|sourceRef|stillPath|\/Users\/|\/home\//.test(s),'Private data leak');return JSON.parse(s);}
async function storedState(id:string){const saved=JSON.parse(await fs.readFile(path.join(data,'store.json'),'utf8'));const session=saved.sessions.find(([key]:[string])=>key===id)?.[1];assert.ok(session);return JSON.parse(await fs.readFile(path.join(data,'local',session.sandboxId,'shop/data/state.json'),'utf8'));}
async function image(page:Page){const el=page.getByAltText('The captured shop screen');await el.waitFor();await eventually(()=>el.evaluate(e=>(e as HTMLImageElement).naturalWidth===1024),'Screenshot failed to load');return el;}
async function clickImage(page:Page,pt:{x:number;y:number}){const el=await image(page);await el.scrollIntoViewIfNeeded();const b=await el.boundingBox();assert.ok(b);const response=page.waitForResponse(r=>r.url().endsWith('/input')&&r.request().method()==='POST');await page.mouse.move(b.x+pt.x*b.width/1024,b.y+pt.y*b.height/768,{steps:12});await pause(200);await page.mouse.click(b.x+pt.x*b.width/1024,b.y+pt.y*b.height/768);const frame=await(await response).json();await eventually(()=>el.getAttribute('src').then(s=>s===`data:${frame.mime};base64,${frame.image}`),'Input frame never displayed');await pause(650);}
async function chapter(page:Page,title:string){chapters.push({title,at:(Date.now()-clipStart)/1000,clip});console.log(title);await page.screenshot({path:path.join(out,`${String(chapters.length).padStart(2,'0')}.png`),fullPage:true});await pause(2200);}
async function main(){
 await fs.mkdir(out,{recursive:true});
 const referenceDir=path.join(out,'reference-shop');const shop=path.resolve('../test-app/shop');
 await fs.rm(referenceDir,{recursive:true,force:true});await fs.cp(shop,referenceDir,{recursive:true,filter:s=>!['node_modules','data','logs','.git','DEMO_NOTES.md'].includes(path.basename(s))});await fs.symlink(path.join(shop,'node_modules'),path.join(referenceDir,'node_modules'),'dir');
 const port=await new Promise<number>((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const a=s.address();assert.ok(a&&typeof a!=='string');s.close(()=>resolve(a.port));});});
 const proc=spawn(process.execPath,['server.js'],{cwd:referenceDir,env:{...process.env,PORT:String(port),PERSIST_STATE:'0'},stdio:'ignore'});
 const browser=await chromium.launch({headless:true});
 try{
 await eventually(async()=>(await fetch(`http://127.0.0.1:${port}/health`)).ok,'Reference health');
 const referenceContext=await browser.newContext({viewport:{width:1024,height:768}});const reference=await referenceContext.newPage();await reference.goto(`http://127.0.0.1:${port}`);await reference.getByTestId('add-tray').waitFor();
 async function point(id:string){const b=await reference.getByTestId(id).boundingBox();assert.ok(b,id);return{x:b.x+b.width/2,y:b.y+b.height/2};}
 const context=await browser.newContext({viewport:{width:1560,height:1080},recordVideo:{dir:path.join(out,'raw'),size:{width:1560,height:1080}}});
 const errors:string[]=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const page=await context.newPage();clipStart=Date.now();const video1=page.video()!;
 await page.goto(base);await image(page);await page.getByText('LOCAL MODE',{exact:true}).waitFor();await chapter(page,'01  LOCAL MODE — a real browser controls a real shop');
 const golden=await json('/api/golden');
 async function mirror(id:string){await clickImage(page,await point(id));await reference.getByTestId(id).click();}
 await mirror('add-tray');await mirror('bag-button');await clickImage(page,await point('coupon-input'));await page.keyboard.type('WELCOME10',{delay:140});await pause(700);await reference.getByTestId('coupon-input').fill('WELCOME10');await mirror('apply-coupon');await mirror('increase-tray');await mirror('pay-button');await pause(1000);
 await chapter(page,'02  Bug reproduced: coupon + quantity change causes payment failure');
 await eventually(async()=>(await storedState(golden.sessionId)).cart[0]?.quantity===2,'Golden quantity');const captured=await storedState(golden.sessionId);
 await page.getByLabel('What went wrong?',{exact:false}).fill('Payment fails after changing a quantity.');const response=page.waitForResponse(r=>r.url().endsWith('/api/captures')&&r.request().method()==='POST');await page.getByRole('button',{name:'Capture LIVESHOT'}).click();const capture=await(await response).json();assert.ok(capture.id);await pause(1500);await chapter(page,'03  Capture creates a share link, QR code, still, state and logs');
 await page.goto(base+capture.url);await image(page);await chapter(page,'04  The share link starts as an ordinary still image');
 await clickImage(page,await point('remove-coupon'));await page.getByRole('heading',{name:'The moment is yours.'}).waitFor();const firstId=await page.evaluate(id=>sessionStorage.getItem(`liveshot:${id}`),capture.id);assert.ok(firstId);await eventually(async()=>(await storedState(firstId)).coupon===null,'First click was not replayed');await chapter(page,'05  First click wakes a private copy AND removes its coupon');
 await reference.request.delete(`http://127.0.0.1:${port}/api/coupon`);await reference.reload();await reference.getByTestId('bag-button').click();await reference.getByTestId('coupon-input').waitFor();await clickImage(page,await point('pay-button'));await eventually(async()=>!!(await storedState(firstId)).order,'Copy did not confirm order');await chapter(page,'06  The private copy completes checkout successfully');checks.push('Image-only bug reproduction, capture, first-click replay and successful private checkout');
 await page.goto(base);await image(page);assert.deepEqual(await storedState(golden.sessionId),captured);await chapter(page,'07  Back at the tester: the original cart is still broken');checks.push('Original tester state remained unchanged');
 await page.goto(base+capture.url);await page.getByRole('heading',{name:'The moment is yours.'}).waitFor();await pause(1000);
 const nextPage=context.waitForEvent('page');await page.getByRole('link',{name:/Open a new copy/}).click();const other=await nextPage;const video2=other.video()!;await image(other);await page.close();await video1.saveAs(path.join(out,'01-capture-and-private-copy.webm'));
 clip=2;clipStart=Date.now();await chapter(other,'08  A NEW TAB starts from the captured cart, not the completed order');
 await other.getByRole('button',{name:'Interact with this moment'}).click();await other.getByRole('heading',{name:'The moment is yours.'}).waitFor();const secondId=await other.evaluate(id=>sessionStorage.getItem(`liveshot:${id}`),capture.id);assert.ok(secondId&&secondId!==firstId);await eventually(async()=>JSON.stringify(await storedState(secondId))===JSON.stringify(captured),'New tab did not restore independent state');checks.push('Real new-tab copy has independent id and captured state');
 // Get the current checkout layout in the reference without modifying either product machine.
 await reference.goto(`http://127.0.0.1:${port}`);await reference.getByTestId('bag-button').click();await clickImage(other,await point('pay-button'));await chapter(other,'09  Pay fails again in the second copy — the captured bug survived');
 await other.getByRole('button',{name:'Ask AI Detective'}).click();await pause(1000);await chapter(other,'10  AI Detective gets its own copy — explicitly labeled STUB');
 let investigation:any;await eventually(async()=>{const meta=await json(`/api/captures/${capture.id}`);if(!meta.investigationId)return false;investigation=await json(`/api/investigations/${meta.investigationId}`);return investigation.status==='done'||investigation.status==='error';},'Detective timeout',90000);assert.equal(investigation.status,'done');assert.equal(investigation.provider,'STUB');assert.equal(investigation.report.rootCause,'stub run: no model was used');
 for(const e of investigation.report.evidence){const step=investigation.steps.find((s:any)=>s.n===e.step);assert.ok(step.output.replace(/\s+/g,' ').includes(e.excerpt.replace(/\s+/g,' ')));}
 await other.getByRole('heading',{name:'Runtime investigation (STUB)'}).waitFor();await other.getByRole('heading',{name:'Runtime investigation (STUB)'}).scrollIntoViewIfNeeded();await chapter(other,'11  Report quotes real command outputs; no model diagnosis is claimed');
 const evidence=other.getByRole('link',{name:/from step 3/});await evidence.scrollIntoViewIfNeeded();await pause(1200);await evidence.click();await pause(1200);await chapter(other,'12  Click evidence to highlight the command that produced it');checks.push('STUB executed real commands and every evidence quote matches its output');
 await other.goto(`${base}${capture.url}/split`);await other.getByRole('heading',{name:'One moment. Different futures.'}).waitFor();await other.getByRole('button',{name:'Reset my copy'}).waitFor();await other.evaluate(()=>window.scrollTo(0,0));await pause(1200);await chapter(other,'13  Split view: untouched capture, live private copy, Detective transcript');
 // Quantity controls remain accurately mapped when each split-view screen is small.
 const before=(await storedState(secondId)).cart[0].quantity;await clickImage(other,await point('increase-tray'));await eventually(async()=>(await storedState(secondId)).cart[0].quantity===before+1,'Split-view small target mapping');assert.deepEqual(await storedState(golden.sessionId),captured);checks.push('Split-view small-target input works and original remains isolated');
 await chapter(other,'14  The split view is interactive too; the original stays untouched');
 await other.getByRole('heading',{name:'Runtime investigation (STUB)'}).scrollIntoViewIfNeeded();await pause(3000);assert.deepEqual(errors,[]);checks.push('No browser JavaScript exceptions');
 await other.close();await video2.saveAs(path.join(out,'02-independent-copy-detective-split.webm'));await context.close();
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({base,captureId:capture.id,checks,chapters,errors,mode:'local',inference:'STUB (no model used)',clips:['01-capture-and-private-copy.webm','02-independent-copy-detective-split.webm']},null,2));console.log('PASS entire recorded walkthrough');
 }finally{await browser.close();proc.kill('SIGTERM');}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
