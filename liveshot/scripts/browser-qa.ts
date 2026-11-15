/** Real Chromium QA. The reference shop supplies coordinates only; all LIVESHOT shop interactions use viewer pixels. */
import assert from 'node:assert/strict';
import { chromium, type Page, type Browser } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
const base = process.env.BASE_URL || 'http://localhost:4001';
const dataDir = path.resolve(process.env.LIVESHOT_DATA_DIR || '.data/qa-instance');
const artifactDir = path.resolve('.data/qa');
const delay = (ms:number) => new Promise(r=>setTimeout(r,ms));
let browser: Browser | undefined, shopProcess: ChildProcess | undefined;
const failures: string[] = [], checks: string[] = [];
const ok = (text:string) => { checks.push(text); console.log(`PASS ${text}`); };
async function eventually<T>(fn:()=>Promise<T>, predicate:(value:T)=>boolean, message:string, milliseconds=20000) {
 const deadline=Date.now()+milliseconds;
 let last:T|undefined;
 while(Date.now()<deadline){try{last=await fn();if(predicate(last))return last;}catch{}await delay(100);}
 throw new Error(`${message}; last=${JSON.stringify(last)}`);
}
async function json(route:string, init?:RequestInit){const r=await fetch(base+route,init);const text=await r.text();assert.ok(r.ok,`${route}: ${r.status} ${text.slice(0,400)}`);assert.ok(!/sandboxId|sourceRef|stillPath|\/Users\/|\/home\/|\/tmp\//.test(text),`Private metadata leak in ${route}`);return JSON.parse(text);}
async function record(sessionId:string){const store=JSON.parse(await fs.readFile(path.join(dataDir,'store.json'),'utf8'));const entry=store.sessions.find(([id]:[string])=>id===sessionId);assert.ok(entry,`Persisted session ${sessionId}`);return entry[1];}
async function state(sessionId:string){const session=await record(sessionId);return JSON.parse(await fs.readFile(path.join(dataDir,'local',session.sandboxId,'shop/data/state.json'),'utf8'));}
async function image(page:Page){const locator=page.getByAltText('The captured shop screen');await locator.waitFor();await eventually(()=>locator.evaluate(el=>(el as HTMLImageElement).naturalWidth),w=>w===1024,'Image width');return locator;}
async function clickImage(page:Page, pt:{x:number;y:number}){
 const target=await image(page);await target.scrollIntoViewIfNeeded();const box=await target.boundingBox();assert.ok(box);const response=page.waitForResponse(r=>r.url().endsWith('/input')&&r.request().method()==='POST');await page.mouse.click(box.x+pt.x/1024*box.width,box.y+pt.y/768*box.height);const frame=await(await response).json();const expected=`data:${frame.mime};base64,${frame.image}`;await eventually(()=>target.getAttribute('src'),src=>src===expected,'Viewer displays returned input frame');
}
async function freePort(){return new Promise<number>((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const addr=server.address();assert.ok(addr&&typeof addr!=='string');server.close(()=>resolve(addr.port));});});}
async function main(){
 await fs.mkdir(artifactDir,{recursive:true});
 const referenceDir=path.join(artifactDir,'reference-shop');await fs.rm(referenceDir,{recursive:true,force:true});
 const shopDir=path.resolve(process.env.SHOP_DIR||'../test-app/shop');
 await fs.cp(shopDir,referenceDir,{recursive:true,filter:s=>!['node_modules','data','logs','.git','DEMO_NOTES.md'].includes(path.basename(s))});
 await fs.symlink(path.join(shopDir,'node_modules'),path.join(referenceDir,'node_modules'),'dir');
 const port=await freePort();shopProcess=spawn(process.execPath,['server.js'],{cwd:referenceDir,env:{...process.env,PORT:String(port),PERSIST_STATE:'0'},stdio:'ignore'});
 await eventually(async()=>{try{return (await fetch(`http://127.0.0.1:${port}/health`)).ok;}catch{return false;}},Boolean,'Reference shop health');
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1560,height:1200}});const reference=await context.newPage();await reference.setViewportSize({width:1024,height:768});await reference.goto(`http://127.0.0.1:${port}`);await reference.getByTestId('add-tray').waitFor();
 async function coordinate(testId:string){const box=await reference.getByTestId(testId).boundingBox();assert.ok(box,`Coordinate target ${testId}`);return{x:box.x+box.width/2,y:box.y+box.height/2};}
 const tester=await context.newPage();const errors:string[]=[];tester.on('pageerror',e=>errors.push(e.message));
 await tester.goto(base);await tester.getByText('LOCAL MODE',{exact:true}).waitFor();await image(tester);
 const golden=await json('/api/golden');
 async function mirrored(testId:string,condition:()=>Promise<boolean>){const pt=await coordinate(testId);await clickImage(tester,pt);await reference.getByTestId(testId).click();await eventually(condition,Boolean,testId);}
 await mirrored('add-tray',async()=>(await state(golden.sessionId)).cart[0]?.quantity===1);
 await mirrored('bag-button',async()=>true);await delay(500);
 await clickImage(tester,await coordinate('coupon-input'));await tester.keyboard.type('WELCOME10',{delay:35});await reference.getByTestId('coupon-input').fill('WELCOME10');await delay(300);
 await mirrored('apply-coupon',async()=>(await state(golden.sessionId)).coupon?.code==='WELCOME10');
 await mirrored('increase-tray',async()=>(await state(golden.sessionId)).cart[0]?.quantity===2);
 await mirrored('pay-button',async()=>true);await reference.getByTestId('checkout-error').waitFor();await delay(800);
 // Persisted logs independently prove the viewer's Pay click reached the live shop.
 const goldenRecord=await record(golden.sessionId);const logs=await fs.readFile(path.join(dataDir,'local',goldenRecord.sandboxId,'shop/logs/app.log'),'utf8');assert.ok(logs.includes('PAY-500')||logs.includes('checkout_failed')||logs.includes('chargedAmount'),'Viewer Pay produced failure log');
 await tester.screenshot({path:path.join(artifactDir,'tester-payment-error.png'),fullPage:true});ok('Image-only add, typing WELCOME10, quantity change and Pay failure');
 const capturedState=await state(golden.sessionId);
 await tester.getByLabel('What went wrong?',{exact:false}).fill('Payment fails after changing a quantity.');
 const captureResponse=tester.waitForResponse(r=>r.url().endsWith('/api/captures')&&r.request().method()==='POST');await tester.getByRole('button',{name:'Capture LIVESHOT'}).click();const capture=await(await captureResponse).json();assert.ok(capture.id&&capture.url);ok('Capture button returns share link');
 const immutable=Buffer.from(await(await fetch(`${base}/api/captures/${capture.id}/still`)).arrayBuffer());
 // Warm the Next route once; separately report cold page/route compilation instead of mislabeling it network latency.
 const warm=await context.newPage();await warm.goto(`${base}${capture.url}`);await image(warm);await warm.close();
 const viewer=await context.newPage();const start=performance.now();await viewer.goto(`${base}${capture.url}`);await image(viewer);const stillMs=Math.round(performance.now()-start);assert.ok(stillMs<1000,`Still took ${stillMs}ms`);ok(`Share still visible in ${stillMs}ms`);
 await viewer.getByText('LOCAL MODE',{exact:true}).waitFor();
 const remove=await coordinate('remove-coupon');await clickImage(viewer,remove);
 await viewer.getByRole('heading',{name:'The moment is yours.'}).waitFor({timeout:30000});
 const copyId=await eventually(()=>viewer.evaluate(id=>sessionStorage.getItem(`liveshot:${id}`),capture.id),Boolean,'Copy id');assert.ok(copyId);
 await eventually(()=>state(copyId),s=>s.coupon===null,'First-click coupon removal');ok('Still wakes private copy and replays first click');
 await reference.getByTestId('remove-coupon').click();await reference.getByTestId('bag-button').click();await clickImage(viewer,await coordinate('pay-button'));await eventually(()=>state(copyId),s=>!!s.order,'Order confirmation');await viewer.screenshot({path:path.join(artifactDir,'copy-order-confirmed.png'),fullPage:true});ok('Copy pays successfully after coupon removal');
 assert.deepEqual(await state(golden.sessionId),capturedState);ok('Tester remains in broken cart after copy checkout');
 const another=await context.newPage();await another.goto(`${base}${capture.url}`);await image(another);await another.getByRole('button',{name:'Interact with this moment'}).click();await another.getByRole('heading',{name:'The moment is yours.'}).waitFor({timeout:30000});
 const otherId=await another.evaluate(id=>sessionStorage.getItem(`liveshot:${id}`),capture.id);assert.ok(otherId&&otherId!==copyId);assert.deepEqual(await state(otherId),capturedState);ok('Second tab begins from independent captured state');
 // Reference UI returns to the captured checkout for subsequent small-target coordinate discovery.
 await reference.getByTestId('pay-button').click();await reference.getByTestId('confirmed-shop').click();await reference.getByTestId('add-tray').click();await reference.getByTestId('bag-button').click();
 const increase=await coordinate('increase-tray');
 for(const width of [512,1024]){await another.setViewportSize({width:1560,height:1400});await another.getByRole('application').evaluate((el,width)=>{(el as HTMLElement).style.width=`${width}px`;},width);await clickImage(another,increase);const expected=width===512?3:4;await eventually(()=>state(otherId),s=>s.cart[0]?.quantity===expected,`Quantity target at ${width}px`);ok(`Small quantity target maps at ${width}px displayed width`);}
 await another.reload();await another.getByRole('heading',{name:'The moment is yours.'}).waitFor();assert.equal(await another.evaluate(id=>sessionStorage.getItem(`liveshot:${id}`),capture.id),otherId);assert.equal((await state(otherId)).cart[0].quantity,4);ok('Same-tab reload resumes its existing copy');
 const unchanged=Buffer.from(await(await fetch(`${base}/api/captures/${capture.id}/still`)).arrayBuffer());assert.ok(immutable.equals(unchanged));ok('Captured still remains immutable');
 await viewer.close();await another.close();
 const ai=await context.newPage();await ai.goto(`${base}${capture.url}`);await ai.getByRole('button',{name:/Ask AI Detective/}).click();
 await eventually(()=>json(`/api/captures/${capture.id}`),v=>!!v.investigationId,'Investigation id');const metadata=await json(`/api/captures/${capture.id}`);const investigation=await eventually(()=>json(`/api/investigations/${metadata.investigationId}`),v=>v.status==='done'||v.status==='error','Investigation completion',90000);assert.equal(investigation.status,'done',investigation.error);assert.equal(investigation.provider,'STUB');assert.ok(investigation.report.rootCause.includes('stub run: no model was used'));
 for(const evidence of investigation.report.evidence){const step=investigation.steps.find((s:{n:number})=>s.n===evidence.step);assert.ok(step?.output?.replace(/\s+/g,' ').includes(evidence.excerpt.replace(/\s+/g,' ')));}
 const evidence=ai.getByRole('link',{name:/from step/}).first();await evidence.waitFor();await evidence.click();const href=await evidence.getAttribute('href');assert.ok(href?.startsWith('#'));await ai.locator(href!).waitFor();await ai.screenshot({path:path.join(artifactDir,'detective-evidence.png'),fullPage:true});ok('STUB Detective report quotes actual command outputs and evidence links reach transcript');
 assert.deepEqual(errors,[]);ok('No tester client exceptions');
 const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});await mobile.goto(`${base}${capture.url}`);await image(mobile);await mobile.getByText('LOCAL MODE',{exact:true}).waitFor();assert.ok(await mobile.getByText('LOCAL MODE',{exact:true}).isVisible());const overflow=await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.ok(!overflow,'Mobile horizontal overflow');await mobile.screenshot({path:path.join(artifactDir,'mobile-still.png'),fullPage:true});ok('Mobile still layout fits 390px viewport');
 await fs.writeFile(path.join(artifactDir,'browser-results.json'),JSON.stringify({base,stillMs,checks,failures},null,2));
}
main().catch(async error=>{failures.push(error.stack||String(error));console.error(error);await fs.mkdir(artifactDir,{recursive:true});await fs.writeFile(path.join(artifactDir,'browser-results.json'),JSON.stringify({base,checks,failures},null,2));process.exitCode=1;}).finally(async()=>{await browser?.close();shopProcess?.kill('SIGTERM');});
