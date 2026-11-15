// UNTESTED: written before credentials were available
import fs from 'node:fs/promises';
import path from 'node:path';
import { Daytona, type Sandbox } from '@daytona/sdk';
import { config } from '../config';
import type { MachineDriver, InputEvent } from './driver';
import type { Capture } from '../types';
import { provisionMachine, readMeasurements, shellQuote, sdkCall, takeScreenshot, hotSnapshot, createSandbox, forkSandbox, deleteIfPresent, verifyShopWindow } from './provision';
let client: Daytona | undefined;
export function daytonaClient() {
  if (!config.daytonaApiKey) throw new Error('DAYTONA_API_KEY is required; use local mode without credentials.');
  return client ??= new Daytona({ apiKey: config.daytonaApiKey, apiUrl: config.daytonaApiUrl, target: config.daytonaTarget, requestTimeoutMs:20_000 });
}
const machines = new Map<string, Sandbox>();
const queues = new Map<string, Promise<unknown>>();
async function serial<T>(id: string, action: () => Promise<T>) {
  const pending = (queues.get(id) || Promise.resolve()).catch(() => {}).then(action); queues.set(id, pending);
  try { return await pending; } finally { if (queues.get(id) === pending) queues.delete(id); }
}
export async function getSandbox(id: string) {
  let sb = machines.get(id);
  if (!sb) { sb = await sdkCall(() => daytonaClient().get(id), 30_000, true); machines.set(id, sb); }
  return sb;
}
export async function getDaytonaGolden(): Promise<string> {
  const saved = JSON.parse(await fs.readFile(path.join(config.dataDir, 'golden.json'), 'utf8')) as { sandboxId: string };
  const sb = await getSandbox(saved.sandboxId);
  if (sb.state !== 'started') throw new Error('Golden machine is not started. Run npm run setup-golden.');
  return sb.id;
}
const truncate = (s: string) => s.length <= 4000 ? s : `${s.slice(0,1950)}\n… output truncated …\n${s.slice(-2000)}`;
export const daytonaDriver: MachineDriver = {
  mode: config.mode,
  async capture(id, captureId) { return serial(id, async () => {
    const sb = await getSandbox(id);
    if (config.mode === 'fork') {
      const child=await forkSandbox(daytonaClient(),sb,`ls-cap-${captureId}`,{app:'liveshot',role:'capture',captureId});
      machines.set(child.id,child);
      return { sourceRef: child.id };
    }
    if (config.mode === 'hot-snapshot') return { sourceRef: await hotSnapshot(daytonaClient(),sb,`ls-cap-${captureId}`) };
    const home = await sdkCall(() => sb.getUserHomeDir(),30_000,true);
    if(!home)throw new Error('Sandbox did not report its home directory');
    const directory = path.join(config.dataDir,'rehydrate',captureId); await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,'state.json'),await sdkCall(() => sb.fs.downloadFile(`${home}/shop/data/state.json`),30_000,true));
    const logs = await sdkCall(() => sb.process.executeCommand('tail -n 200 logs/app.log',`${home}/shop`,undefined,10),15_000,true);
    await fs.writeFile(path.join(directory,'app.log'),logs.result);
    return { sourceRef: directory };
  }); },
  async spawn(capture: Capture,name) {
    const measured=await readMeasurements(capture.mode==='rehydrate');
    let sb: Sandbox;
    if (capture.mode === 'rehydrate') {
      sb = await provisionMachine({ role:'session', name, captureId:capture.id, state:await fs.readFile(path.join(capture.sourceRef,'state.json')), logs:await fs.readFile(path.join(capture.sourceRef,'app.log')), rehydrate:true,measurements:measured,client:daytonaClient() });
    } else if (capture.mode === 'hot-snapshot') {
      sb=await createSandbox(daytonaClient(),{snapshot:capture.sourceRef,name,autoPauseInterval:0,...(measured.autoStopZero?{autoStopInterval:0}:{}),labels:{app:'liveshot',role:'session',captureId:capture.id}});
    } else {
      const source=await getSandbox(capture.sourceRef);
      sb=await forkSandbox(daytonaClient(),source,name,{app:'liveshot',role:'session',captureId:capture.id});
    }
    // A captured browser cannot be reconstructed by restarting the desktop.
    try {
      await takeScreenshot(sb,measured);
      await verifyShopWindow(sb);
    } catch(error) { await deleteIfPresent(()=>sb.delete(60,true)); throw error; }
    machines.set(sb.id,sb);
    return {sandboxId:sb.id};
  },
  async screenshot(id) { return serial(id,async () => takeScreenshot(await getSandbox(id),await readMeasurements())); },
  async input(id,event:InputEvent) { return serial(id,async () => {
    const sb = await getSandbox(id), measured = await readMeasurements();
    const x = 'x' in event ? Math.max(0,Math.min(measured.width-1,Math.round(event.x))) : 0;
    const y = 'y' in event ? Math.max(0,Math.min(measured.height-1,Math.round(event.y))) : 0;
    // Await the transport's own deadline so the queue holds the pending request.
    if (event.type === 'click') await sb.computerUse.mouse.click(x,y,event.button || 'left',event.double || false);
    if (event.type === 'type') await sb.computerUse.keyboard.type(event.text);
    if (event.type === 'key') await (event.modifiers?.length ? sb.computerUse.keyboard.hotkey([...event.modifiers,event.key].join('+')) : sb.computerUse.keyboard.press(event.key));
    if (event.type === 'scroll') await sb.computerUse.mouse.scroll(x,y,event.direction,event.amount || 3);
  }); },
  async exec(id,command,opts) { return serial(id,async () => {
    const sb = await getSandbox(id), home = await sdkCall(() => sb.getUserHomeDir(),30_000,true);
    if(!home)throw new Error('Sandbox did not report its home directory');
    const cwd = !opts?.cwd || opts.cwd === '~/shop' ? `${home}/shop` : opts.cwd;
    const result = await sdkCall(() => sb.process.executeCommand(command.replace(/~\/shop\b/g,shellQuote(`${home}/shop`)),cwd,{PORT:'3000'},opts?.timeoutSec || 20),(opts?.timeoutSec || 20)*1000+5000);
    return {exitCode:result.exitCode,output:truncate(result.result)};
  }); },
  async destroy(id) { return serial(id,async () => { await sdkCall(() => (machines.get(id) ? Promise.resolve(machines.get(id)!) : getSandbox(id)).then(sb => sb.delete(60,true)),65_000); machines.delete(id); }); },
};
