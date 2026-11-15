// UNTESTED: written before credentials were available
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Daytona, DaytonaConnectionError, DaytonaTimeoutError, type CreateSandboxFromSnapshotParams, type Sandbox } from '@daytona/sdk';
import { config } from '../config';
const execute = promisify(execFile);
export const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve,ms));
export const shellQuote = (s:string) => `'${s.replace(/'/g,`'\\''`)}'`;
export function missingResource(error:unknown) {
  return !!error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404;
}
function transient(error:unknown) {
  return error instanceof DaytonaTimeoutError || error instanceof DaytonaConnectionError || /network|ECONN|ETIMEDOUT|fetch failed|socket|operation timed out/i.test(String(error));
}
export async function sdkCall<T>(action:()=>Promise<T>,ms=30_000,retryRead=false):Promise<T> {
  for(let attempt=0;;attempt++) {
    let timer:ReturnType<typeof setTimeout>|undefined;
    try { return await Promise.race([action(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Daytona operation timed out')),ms);})]); }
    catch(error) { if(!retryRead || attempt || !transient(error)) throw error; }
    finally { if(timer) clearTimeout(timer); }
  }
}
export interface Measurements { display:string; browser:string; screenshotFormat:string; width:number; height:number; noSandbox?:boolean; autoStopZero?:boolean; preflightDebug?:boolean; inputPoints?:Record<string,{x:number;y:number}>; }
export async function readMeasurements(rehydrate = config.mode === 'rehydrate'):Promise<Measurements> {
  let saved:Partial<Measurements>={};
  try {
    const record=JSON.parse(await fs.readFile(path.join(config.dataDir,'preflight.json'),'utf8'));
    // Legacy measurements were always collected on the VM.
    saved=record.profiles ? record.profiles[rehydrate ? 'container' : 'vm'] || {} : rehydrate ? {} : record;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const value = { ...saved, display:process.env.DAYTONA_DISPLAY || saved.display, browser:process.env.DAYTONA_BROWSER || saved.browser, screenshotFormat:process.env.DAYTONA_SCREENSHOT_FORMAT || saved.screenshotFormat, width:Number(process.env.DAYTONA_SCREEN_WIDTH || saved.width),height:Number(process.env.DAYTONA_SCREEN_HEIGHT || saved.height) };
  if(!value.display || !value.browser || !value.screenshotFormat || !(value.width>0) || !(value.height>0)) throw new Error('Run credentialed preflight: display, browser, screenshotFormat, width and height must be measured or configured.');
  return {...value, preflightDebug:false} as Measurements;
}
export async function takeScreenshot(sb:Sandbox,measurements:Measurements) {
  const format=measurements.screenshotFormat;
  const shot=await sdkCall(()=>format==='fullscreen' ? sb.computerUse.screenshot.takeFullScreen(true) : sb.computerUse.screenshot.takeCompressed({format,quality:70,showCursor:true}),30_000,true);
  if(!shot.screenshot) throw new Error('Daytona screenshot was empty');
  return {base64:shot.screenshot,mime:format==='png'||format==='fullscreen'?'image/png':'image/jpeg'};
}
export async function uploadShop(sb:Sandbox) {
  const home=await sdkCall(()=>sb.getUserHomeDir(),30_000,true);
  if(!home) throw new Error('Sandbox did not report a user home directory');
  await fs.mkdir(config.dataDir,{recursive:true});
  const archive=path.join(config.dataDir,`shop-${sb.id}.tgz`);
  await execute('tar',['czf',archive,'--exclude=node_modules','--exclude=logs','--exclude=data','--exclude=DEMO_NOTES.md','-C',path.dirname(config.shopDir),path.basename(config.shopDir)]);
  const listing=await execute('tar',['tzf',archive]);
  if(listing.stdout.split('\n').some(line=>line.includes('DEMO_NOTES.md') || /(^|\/)node_modules\//.test(line))) throw new Error('Refusing unsafe shop archive');
  try { await sdkCall(()=>sb.fs.uploadFile(archive,`${home}/shop.tgz`),30_000); }
  finally { await fs.rm(archive,{force:true}); }
  await checkedExec(sb,'tar xzf shop.tgz',home,30);
  await checkedExec(sb,'npm ci --omit=dev',`${home}/shop`,180);
  return home;
}
export async function checkedExec(sb:Sandbox,command:string,cwd?:string,timeout=20) {
  const result=await sdkCall(()=>sb.process.executeCommand(command,cwd,undefined,timeout),timeout*1000+5000);
  if(result.exitCode!==0) throw new Error(`Remote command failed (${result.exitCode}): ${result.result.slice(-1500)}`);
  return result.result;
}
async function installPackages(sb:Sandbox, packages:string) {
  const sudo='if [ "$(id -u)" -eq 0 ]; then admin=""; else admin="sudo -n"; fi';
  await checkedExec(sb, `${sudo}; $admin apt-get update && $admin apt-get install -y ${packages}`,undefined,180);
}
export async function ensureRuntime(sb:Sandbox) {
  const check=`node -e "process.exit(parseInt(process.versions.node) >= 20 ? 0 : 1)" && npm --version`;
  const result=await sdkCall(()=>sb.process.executeCommand(check,undefined,undefined,10),15_000,true);
  if(result.exitCode===0) return;
  await installPackages(sb,'nodejs npm');
  // Some distribution mirrors provide an older Node. Use the npm registry for Node 22.
  const after=await sdkCall(()=>sb.process.executeCommand(check,undefined,undefined,10),15_000,true);
  if(after.exitCode!==0) {
    await checkedExec(sb,'if [ "$(id -u)" -eq 0 ]; then npm install -g node@22; else sudo -n npm install -g node@22; fi',undefined,180);
    await checkedExec(sb,check);
  }
}
export async function ensureBrowser(sb:Sandbox, preferred?:string) {
  const discover=preferred ? `command -v ${shellQuote(preferred)}` :
    'for b in chromium chromium-browser google-chrome google-chrome-stable firefox firefox-esr; do command -v "$b" && exit 0; done; exit 1';
  const found=await sdkCall(()=>sb.process.executeCommand(discover,undefined,undefined,10),15_000,true);
  if(found.exitCode===0 && found.result.trim()) return found.result.trim();
  await installPackages(sb,'chromium');
  return (await checkedExec(sb,discover)).trim();
}
export async function verifyShopWindow(sb:Sandbox) {
  const windows=await sdkCall(()=>sb.computerUse.display.getWindows(),30_000,true);
  if(!windows.windows?.some(window=>/FORM & FIELD/i.test(window.title || ''))) throw new Error('No FORM & FIELD shop window on the desktop');
}
export async function deleteIfPresent(remove:()=>Promise<unknown>) {
  try { await sdkCall(remove,65_000); }
  catch(error) { if(!missingResource(error)) throw error; }
}
async function cleanFailedAllocation(client:Daytona,name:string,error:unknown):Promise<never> {
  const id=error instanceof DaytonaTimeoutError ? error.sandboxId : undefined;
  if(id || transient(error)) {
    try {
      const sb=await sdkCall(()=>client.get(id || name),30_000,true);
      await deleteIfPresent(()=>sb.delete(60,true));
    } catch(cleanupError) {
      if(!missingResource(cleanupError)) throw new AggregateError([error,cleanupError],`Allocation failed; cleanup required for ${name}`);
    }
  }
  throw error;
}
export async function createSandbox(client:Daytona,params:CreateSandboxFromSnapshotParams & {name:string}) {
  try { return await sdkCall(()=>client.create(params,{timeout:120}),125_000); }
  catch(error) { return cleanFailedAllocation(client,params.name,error); }
}
export async function forkSandbox(client:Daytona,parent:Sandbox,name:string,labels:Record<string,string>) {
  let child:Sandbox;
  try { child=await sdkCall(()=>parent.fork({name},120),125_000); }
  catch(error) { return cleanFailedAllocation(client,name,error); }
  try { await sdkCall(()=>child.setLabels({...labels,parentId:parent.id})); return child; }
  catch(error) { await deleteIfPresent(()=>child.delete(60,true)); throw error; }
}
export async function startShop(sb:Sandbox,home:string,persist:boolean) {
  await checkedExec(sb,`nohup env ${persist?'PERSIST_STATE=1 ':''}node server.js > /tmp/shop.log 2>&1 < /dev/null &`,`${home}/shop`);
  for(let n=0;n<30;n++) { const result=await sdkCall(()=>sb.process.executeCommand('curl -s -o /dev/null -w "%{http_code}" localhost:3000/health',undefined,undefined,5),10_000,true); if(result.result.trim()==='200') return; await sleep(1000); }
  throw new Error('Shop health check timed out');
}
export async function launchBrowser(sb:Sandbox,measured:Measurements):Promise<void> {
  const firefox=/firefox/.test(measured.browser);
  const flags=firefox?'--kiosk':`--kiosk --no-first-run --no-default-browser-check --disable-infobars --disable-session-crashed-bubble --disable-translate --password-store=basic --user-data-dir=/tmp/ls-profile${measured.noSandbox?' --no-sandbox':''}${measured.preflightDebug?' --remote-debugging-port=9222':''}`;
  await checkedExec(sb,`nohup env DISPLAY=${shellQuote(measured.display)} ${shellQuote(measured.browser)} ${flags} http://localhost:3000 > /tmp/browser.log 2>&1 < /dev/null &`);
  await sleep(4000);
  // A browser which exited as root explicitly asks for --no-sandbox; do not add it speculatively.
  const log=await sdkCall(()=>sb.process.executeCommand('cat /tmp/browser.log',undefined,undefined,5),10_000,true);
  if(!firefox && !measured.noSandbox && /Running as root without --no-sandbox|No usable sandbox/.test(log.result)) { measured.noSandbox=true; return launchBrowser(sb,measured); }
  await verifyShopWindow(sb);
}
interface ProvisionOptions { role:string; name:string; captureId?:string; runId?:string; state?:Buffer; logs?:Buffer; rehydrate?:boolean; measurements?:Measurements; client?:Daytona; }
export async function provisionMachine(options:ProvisionOptions):Promise<Sandbox> {
  const measured=options.measurements || await readMeasurements(!!options.rehydrate);
  if(!options.client && !config.daytonaApiKey) throw new Error('DAYTONA_API_KEY is required');
  const client=options.client || new Daytona({apiKey:config.daytonaApiKey,apiUrl:config.daytonaApiUrl,target:config.daytonaTarget,requestTimeoutMs:20_000});
  const params={...(options.rehydrate?{envVars:{VNC_RESOLUTION:`${measured.width}x${measured.height}`}}:{snapshot:config.daytonaVmSnapshot}),name:options.name,...(options.rehydrate?{autoStopInterval:0}:{autoPauseInterval:0}),...(measured.autoStopZero?{autoStopInterval:0}:{}),labels:{app:'liveshot',role:options.role,...(options.runId?{runId:options.runId}:{}),...(options.captureId?{captureId:options.captureId}:{})}};
  const sb=await createSandbox(client,params);
  try {
    await ensureRuntime(sb);
    await ensureBrowser(sb,measured.browser);
    const home=await uploadShop(sb);
    if(options.state) { await checkedExec(sb,'mkdir -p data logs',`${home}/shop`); await sdkCall(()=>sb.fs.uploadFile(options.state!,`${home}/shop/data/state.json`),30_000); }
    if(options.logs) await sdkCall(()=>sb.fs.uploadFile(options.logs!,`${home}/shop/logs/app.log`),30_000);
    await startShop(sb,home,!!options.rehydrate);
    await sdkCall(()=>sb.computerUse.start(),30_000); await sleep(2000); await launchBrowser(sb,measured);
    if(options.state && !JSON.parse(options.state.toString()).lastPaymentError && measured.inputPoints?.bag) { const pt=measured.inputPoints.bag; await sdkCall(()=>sb.computerUse.mouse.click(pt.x,pt.y),15_000); await sleep(350); }
    return sb;
  } catch(error) { await deleteIfPresent(()=>sb.delete(60,true)); throw error; }
}
export async function hotSnapshot(client:Daytona,sb:Sandbox,name:string) {
  const url=`${config.daytonaApiUrl.replace(/\/$/,'')}/sandbox/${encodeURIComponent(sb.id)}/snapshot`;
  const make=(organization:boolean)=>fetch(url,{method:'POST',headers:{Authorization:`Bearer ${config.daytonaApiKey}`,'Content-Type':'application/json',...(organization&&config.daytonaOrganizationId?{'X-Daytona-Organization-ID':config.daytonaOrganizationId}:{})},body:JSON.stringify({name,includeMemory:true}),signal:AbortSignal.timeout(120_000)});
  const directory=path.join(config.dataDir,'snapshots');
  await fs.mkdir(directory,{recursive:true});
  const marker=path.join(directory,name);
  // The marker survives a process exit between submitting the POST and saving the capture.
  await fs.writeFile(marker,'',{flag:'wx'});
  let response=await make(false);
  if(!response.ok && [400,401,403].includes(response.status) && config.daytonaOrganizationId) response=await make(true);
  if(!response.ok) {
    if(response.status>=400 && response.status<500) await fs.rm(marker,{force:true});
    throw new Error(`Hot snapshot HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
  }
  const deadline=Date.now()+120_000;
  try {
    while(Date.now()<deadline) {
      let snapshot;
      try { snapshot=await sdkCall(()=>client.snapshot.get(name),Math.min(30_000,deadline-Date.now()),true); }
      catch(error) { if(!missingResource(error)) throw error; }
      if(snapshot?.state==='active') return name;
      if(snapshot && ['error','build_failed','removing'].includes(snapshot.state)) throw new Error(`Hot snapshot entered ${snapshot.state}`);
      await sleep(1000);
    }
    throw new Error('Hot snapshot did not become active');
  } catch(error) {
    // A 404 immediately after submission can still become visible. Keep the marker for cleanup.
    try { await sdkCall(()=>client.snapshot.delete(name),60_000); await fs.rm(marker,{force:true}); }
    catch(cleanupError) { if(!missingResource(cleanupError)) throw new AggregateError([error,cleanupError],`Snapshot cleanup required for ${name}`); }
    throw error;
  }
}
