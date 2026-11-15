// UNTESTED: written before credentials were available
import { loadEnvConfig } from '@next/env';
import type { Measurements } from '../lib/machine/provision';
import type { Sandbox } from '@daytona/sdk';
loadEnvConfig(process.cwd());

// The probe reads layout only; every mutation below uses Computer Use. This tiny
// WebSocket client runs inside the VM against the kiosk's loopback DevTools port.
const layoutProbe = String.raw`
const http=require('http'),net=require('net'),crypto=require('crypto');
http.get('http://127.0.0.1:9222/json',r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>{
 const page=JSON.parse(b).find(p=>p.type==='page'&&p.url.includes('localhost:3000'));if(!page)throw Error('No kiosk page');
 const u=new URL(page.webSocketDebuggerUrl),s=net.connect(+u.port,u.hostname);let hand=false,buf=Buffer.alloc(0);
 const expression='JSON.stringify(Object.fromEntries([...document.querySelectorAll("[data-testid]")].map(e=>{const r=e.getBoundingClientRect();return [e.dataset.testid,{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),visible:r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth}]})))';
 function send(){const p=Buffer.from(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true}})),m=crypto.randomBytes(4),h=p.length<126?Buffer.from([129,128|p.length]):Buffer.from([129,254,p.length>>8,p.length&255]);for(let i=0;i<p.length;i++)p[i]^=m[i%4];s.write(Buffer.concat([h,m,p]));}
 s.on('connect',()=>s.write('GET '+u.pathname+' HTTP/1.1\r\nHost: '+u.host+'\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: '+crypto.randomBytes(16).toString('base64')+'\r\nSec-WebSocket-Version: 13\r\n\r\n'));
 s.on('data',d=>{buf=Buffer.concat([buf,d]);if(!hand){const i=buf.indexOf('\r\n\r\n');if(i<0)return;buf=buf.subarray(i+4);hand=true;send();}
 while(buf.length>=2){let n=buf[1]&127,o=2;if(n===126){if(buf.length<4)return;n=buf.readUInt16BE(2);o=4;}else if(n===127){if(buf.length<10)return;n=Number(buf.readBigUInt64BE(2));o=10;}if(buf.length<o+n)return;const payload=buf.subarray(o,o+n).toString();buf=buf.subarray(o+n);try{const m=JSON.parse(payload);if(m.id===1){if(!m.result?.result?.value)throw Error(JSON.stringify(m));console.log(m.result.result.value);s.destroy();}}catch(e){console.error(e);process.exitCode=1;}}});
 });}).on('error',e=>{console.error(e);process.exitCode=1;});setTimeout(()=>process.exit(2),8000).unref();`;

type Profile = 'vm' | 'container';
type Point = {x:number; y:number; visible:boolean};
const newMeasurements=():Measurements=>({display:'',browser:'',screenshotFormat:'',width:0,height:0,preflightDebug:true});

async function main() {
  const {config}=await import('../lib/config');
  const {daytonaClient}=await import('../lib/machine/daytona');
  const {sdkCall,sleep,shellQuote,takeScreenshot,uploadShop,startShop,launchBrowser,hotSnapshot,createSandbox,
    forkSandbox,deleteIfPresent,ensureRuntime,ensureBrowser,checkedExec,provisionMachine}=await import('../lib/machine/provision');
  const fs=await import('node:fs/promises');
  const path=await import('node:path');
  const {isDeepStrictEqual}=await import('node:util');
  const started=Date.now(), runId=String(started), client=daytonaClient();
  const directory=path.join(config.dataDir,'preflight');
  await fs.mkdir(directory,{recursive:true});
  const steps:{n:number; name:string; pass:boolean; ms:number; detail?:unknown}[]=[];
  const profiles:Partial<Record<Profile,Measurements>>={};
  const result={runId,steps,profiles,recommendedMode:'rehydrate',modeVerified:false,agentProtocol:'json',model:'',forkSeconds:0,maxForks:0};
  const made=new Map<string,Sandbox>();
  const snapshots:string[]=[];
  const labels={app:'liveshot',role:'preflight',runId};
  let measured=newMeasurements();
  async function save(){
    const selected=profiles[result.recommendedMode==='rehydrate'?'container':'vm'];
    const file=path.join(config.dataDir,'preflight.json');
    await fs.writeFile(file+'.tmp',JSON.stringify({...result,...selected},null,2));
    await fs.rename(file+'.tmp',file);
  }
  async function step<T>(n:number,name:string,action:()=>Promise<T>) {
    const start=Date.now();
    try {
      if(start-started>540_000) throw Error('Preflight budget reached; reserving cleanup time');
      const detail=await action();
      steps.push({n,name,pass:true,ms:Date.now()-start,detail});
      console.log(`PASS ${n} ${name} ${Date.now()-start}ms`);
      return true;
    } catch(error) {
      const detail=error instanceof Error?error.message:String(error);
      steps.push({n,name,pass:false,ms:Date.now()-start,detail});
      console.log(`FAIL ${n} ${name}: ${detail}`);
      return false;
    } finally { await save(); }
  }
  async function screenshot(sb:Sandbox,name:string) {
    const shot=await takeScreenshot(sb,measured);
    const bytes=Buffer.from(shot.base64,'base64');
    await fs.writeFile(path.join(directory,`${name}.${shot.mime==='image/png'?'png':'jpg'}`),bytes);
    return bytes;
  }
  async function points(sb:Sandbox):Promise<Record<string,Point>> {
    const output=await checkedExec(sb,`node -e ${shellQuote(layoutProbe)}`,undefined,12);
    return JSON.parse(output);
  }
  async function click(sb:Sandbox,id:string) {
    const point=(await points(sb))[id];
    if(!point?.visible || point.x<0 || point.x>=measured.width || point.y<0 || point.y>=measured.height) throw Error(`Control outside measured screen: ${id}`);
    measured.inputPoints??={};
    measured.inputPoints[id==='bag-button'?'bag':id]=point;
    await sdkCall(()=>sb.computerUse.mouse.click(point.x,point.y),15_000);
    await sleep(500);
  }
  async function state(sb:Sandbox){ return JSON.parse(await checkedExec(sb,'curl -fsS localhost:3000/api/debug/state')); }
  async function screenshotDifference(a:Buffer,b:Buffer) {
    const sharp=(await import('sharp')).default;
    const pixels=(bytes:Buffer)=>sharp(bytes).removeAlpha().resize(96,72,{fit:'fill'}).raw().toBuffer();
    const [x,y]=await Promise.all([pixels(a),pixels(b)]);
    return x.reduce((sum,value,i)=>sum+Math.abs(value-y[i]),0)/(255*x.length);
  }
  async function verifyCopy(parent:Sandbox,copy:Sandbox,name:string) {
    const original=await state(parent);
    if(!isDeepStrictEqual(await state(copy),original)) throw Error('Copied server state differs from parent');
    const a=await screenshot(parent,name+'-parent');
    const b=await screenshot(copy,name+'-before');
    if(await screenshotDifference(a,b)>0.015) throw Error('Copied desktop differs from parent; inspect saved screenshots');
    const layout=await points(parent), copiedLayout=await points(copy);
    if(!copiedLayout['increase-tray']?.visible || !!layout['checkout-error']?.visible!==!!copiedLayout['checkout-error']?.visible) throw Error('Inherited checkout UI differs from parent');
    await click(copy,'increase-tray');
    const c=await screenshot(copy,name+'-after');
    const quantity=(session:typeof original)=>session.cart.find((item:{productId:string})=>item.productId==='tray')?.quantity;
    if(b.equals(c) || quantity(await state(copy))!==quantity(original)+1) throw Error('Copy quantity click did not change both frame and cart');
    if(!isDeepStrictEqual(await state(parent),original)) throw Error('Copy input changed its parent');
  }
  function track(sb:Sandbox) { made.set(sb.id,sb); return sb; }
  async function cleanSandboxes() {
    const pending=[...made.values()].reverse();
    let errors:unknown[]=[];
    while(pending.length) {
      errors=[];
      const count=pending.length;
      for(const sb of [...pending]){
        if(pending.some(child=>child.labels.parentId===sb.id))continue;
        try { await deleteIfPresent(()=>sb.delete(60,true)); made.delete(sb.id); pending.splice(pending.indexOf(sb),1); }
        catch(error){ errors.push(error); }
      }
      if(pending.length===count)throw Error(`${count} sandbox(es) still allocated: ${errors.map(String).join(', ')}`);
    }
  }
  async function probe(sb:Sandbox,kind:Profile) {
    const run=<T>(n:number,name:string,action:()=>Promise<T>)=>step(n,kind+' '+name,action);
    if(!await run(2,'Runtime and permissions',async()=>{
      await ensureRuntime(sb);
      return checkedExec(sb,'whoami; node -v; npm -v; sudo -n true && echo SUDO_OK; echo $SHELL');
    }))return false;
    if(!await run(3,'Start desktop and measure display',async()=>{
      await sdkCall(()=>sb.computerUse.start()); await sleep(2000);
      const info=await sdkCall(()=>sb.computerUse.display.getInfo(),30_000,true);
      const display=info.displays?.[0];
      if(!display?.width||!display.height)throw Error('No display resolution');
      measured.width=display.width; measured.height=display.height;
      return info;
    }))return false;
    if(!await run(4,'Discover DISPLAY and desktop ports',async()=>{
      const info=await checkedExec(sb,'ls /tmp/.X11-unix; ps aux | grep -E "Xvfb|x11vnc|novnc|websockify" | grep -v grep; ss -ltnp');
      const number=info.match(/(?:^|\n)X(\d+)(?:\s|$)/)?.[1];
      if(!number)throw Error('No X socket discovered');
      measured.display=':'+number; return info;
    }))return false;
    if(!await run(5,'Discover browser',async()=>measured.browser=await ensureBrowser(sb)))return false;
    if(!await run(6,'Probe screenshot formats',async()=>{
      const attempts=[];
      for(const format of ['jpeg','jpg','png','fullscreen']){
        const start=Date.now();
        try {
          const shot=await takeScreenshot(sb,{...measured,screenshotFormat:format});
          const bytes=Buffer.from(shot.base64,'base64');
          attempts.push({format,ms:Date.now()-start,bytes:bytes.length,pass:true});
          await fs.writeFile(path.join(directory,`${kind}-format-${format}.${shot.mime==='image/png'?'png':'jpg'}`),bytes);
          measured.screenshotFormat=format;
          return attempts;
        } catch(error) { attempts.push({format,ms:Date.now()-start,pass:false,error:String(error)}); }
      }
      throw Error(JSON.stringify(attempts));
    }))return false;
    let home='';
    if(!await run(7,'Upload shop and launch kiosk',async()=>{
      home=await uploadShop(sb); await startShop(sb,home,true); await launchBrowser(sb,measured);
      await screenshot(sb,kind+'-shop'); return {browser:measured.browser,noSandbox:!!measured.noSandbox};
    }))return false;
    if(!await run(8,'Reproduce failed checkout through Computer Use',async()=>{
      await click(sb,'add-tray'); await click(sb,'bag-button'); await click(sb,'coupon-input');
      await sdkCall(()=>sb.computerUse.keyboard.type('WELCOME10'),15_000);
      await click(sb,'apply-coupon'); await click(sb,'increase-tray'); await click(sb,'pay-button');
      const layout=await points(sb);
      const logs=await checkedExec(sb,'tail -n 20 logs/app.log',home+'/shop');
      if(!layout['checkout-error']?.visible || !logs.split('\n').some(line=>line && JSON.parse(line).action==='checkout.failed'))throw Error('Pay click did not produce both visible checkout error and failed checkout log');
      await screenshot(sb,kind+'-A-failure');
      return {reproduced:true};
    }))return false;
    return true;
  }
  try {
    let vm:Sandbox|undefined;
    await step(1,'Create VM',async()=>{
      const params={snapshot:config.daytonaVmSnapshot,name:'ls-pf-vm-'+runId,autoPauseInterval:0,labels};
      try { vm=track(await createSandbox(client,{...params,autoStopInterval:0})); measured.autoStopZero=true; }
      catch(error) {
        if(!/auto.?stop|interval/i.test(String(error)))throw error;
        vm=track(await createSandbox(client,params)); measured.autoStopZero=false;
      }
      return {created:true};
    });
    if(vm && await probe(vm,'vm')){
      profiles.vm={...measured,preflightDebug:false};
      const parent=vm;
      let child:Sandbox|undefined;
      const first=await step(9,'Fork isolation and desktop',async()=>{
        const start=Date.now();
        child=track(await forkSandbox(client,parent,'ls-pf-capture-'+runId,labels));
        result.forkSeconds=(Date.now()-start)/1000;
        await verifyCopy(parent,child,'capture');
        return {seconds:result.forkSeconds};
      });
      const chain=first && child && await step(10,'Fork the fork',async()=>{
        const copy=track(await forkSandbox(client,child!,'ls-pf-session-'+runId,labels));
        await verifyCopy(child!,copy,'session');
        return {verified:true};
      });
      if(chain) {
        result.recommendedMode='fork'; result.modeVerified=true;
        await step(11,'Measure fork quota',async()=>{
          result.maxForks=made.size-1;
          while(result.maxForks<4){
            try { track(await forkSandbox(client,parent,`ls-pf-quota-${result.maxForks}-${runId}`,labels)); result.maxForks++; }
            catch(error) {return {count:result.maxForks,failure:String(error)};}
          }
          return {count:result.maxForks};
        });
      } else {
        // Release failed/partially verified forks before testing another copy on tight quota.
        for(const sb of [...made.values()].reverse())if(sb.id!==parent.id){await deleteIfPresent(()=>sb.delete(60,true));made.delete(sb.id);}
        const hot=await step(12,'Hot memory snapshot fallback',async()=>{
          const name='ls-pf-hot-'+runId; snapshots.push(name);
          await hotSnapshot(client,parent,name);
          const copy=track(await createSandbox(client,{name:'ls-pf-restored-'+runId,snapshot:name,autoPauseInterval:0,...(measured.autoStopZero?{autoStopInterval:0}:{}),labels}));
          await verifyCopy(parent,copy,'hot');
          return {verified:true};
        });
        if(hot){ result.recommendedMode='hot-snapshot';result.modeVerified=true; }
      }
    }
    if(!result.modeVerified){
      await cleanSandboxes();
      measured=newMeasurements();
      let container:Sandbox|undefined;
      await step(1,'Create fallback container',async()=>{
        container=track(await createSandbox(client,{name:'ls-pf-container-'+runId,envVars:{VNC_RESOLUTION:'1024x768'},autoStopInterval:0,labels}));
        measured.autoStopZero=true; return {created:true};
      });
      if(container && await probe(container,'container')){
        const source=container;
        result.modeVerified=await step(12,'Restore persisted state on a fresh container',async()=>{
          const home=await sdkCall(()=>source.getUserHomeDir(),30_000,true);
          if(!home)throw Error('Container did not report a home');
          const stateBytes=await sdkCall(()=>source.fs.downloadFile(home+'/shop/data/state.json'),30_000,true);
          const logs=await sdkCall(()=>source.fs.downloadFile(home+'/shop/logs/app.log'),30_000,true);
          const copy=track(await provisionMachine({client,role:'preflight',name:'ls-pf-rehydrated-'+runId,rehydrate:true,measurements:measured,state:stateBytes,logs,runId}));
          await verifyCopy(source,copy,'rehydrate'); return {restored:true};
        });
        if(result.modeVerified)profiles.container={...measured,preflightDebug:false};
      }
    }
    await step(13,'Model list and tool calling',async()=>{
      if(!config.llmApiKey || config.llmBaseUrl==='stub')throw Error('No live inference key configured');
      const OpenAI=(await import('openai')).default;
      const llm=new OpenAI({apiKey:config.llmApiKey,baseURL:config.llmBaseUrl,timeout:90_000,maxRetries:0});
      const models=await llm.models.list();
      const model=config.llmModel||models.data[0]?.id;
      if(!model)throw Error('No live models; start a Nosana deployment');
      result.model=model;
      const completion=await llm.chat.completions.create({model,messages:[{role:'user',content:'Call run_shell with command echo LIVESHOT_PREFLIGHT'}],tools:[{type:'function',function:{name:'run_shell',description:'Run a shell command',parameters:{type:'object',properties:{command:{type:'string'}},required:['command']}}}]});
      if(!completion.choices[0]?.message.tool_calls?.length)throw Error('No tool_calls: use AGENT_PROTOCOL=json');
      result.agentProtocol='tools';return {model,toolCalling:true};
    });
  } finally {
    const start=Date.now(), errors:string[]=[];
    try {
      const recovered=await sdkCall(async()=>{
        const found:Sandbox[]=[];
        for await(const sb of client.list({labels:{app:'liveshot',runId}}))found.push(sb);
        return found;
      },60_000,true);
      for(const sb of recovered)if(!made.has(sb.id))track(sb);
    } catch(error){ errors.push(String(error)); }
    try { await cleanSandboxes(); } catch(error){ errors.push(String(error)); }
    for(const name of snapshots){
      try {
        await deleteIfPresent(()=>client.snapshot.delete(name));
        await fs.rm(path.join(config.dataDir,'snapshots',name),{force:true});
      } catch(error){errors.push(String(error));}
    }
    steps.push({n:14,name:'Delete preflight resources children first',pass:errors.length===0,ms:Date.now()-start,detail:{remaining:made.size,errors}});
    await save();
    console.log(`${errors.length?'FAIL':'PASS'} 14 cleanup`);
    if(result.modeVerified) {
      console.log(`Recommended LIVESHOT_MODE=${result.recommendedMode}; AGENT_PROTOCOL=${result.agentProtocol}`);
      if(result.recommendedMode==='rehydrate')console.log('Use restored state wording for this demo.');
    } else {console.log('No working credentialed mode verified; inspect preflight.json before setup.');}
    if(!result.modeVerified||errors.length)process.exitCode=1;
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
