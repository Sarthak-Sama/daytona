import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { spawn, exec as execCommand, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { nanoid } from 'nanoid';
import { config } from '../config';
import type { Capture } from '../types';
import type { InputEvent, MachineDriver } from './driver';

type LocalMachine = { id: string; directory: string; port: number; process: ChildProcess; context: BrowserContext; page: Page };
type LocalRuntime = { machines: Map<string, LocalMachine>; browser?: Promise<Browser>; golden?: Promise<{ sandboxId: string }>; queues: Map<string, Promise<unknown>> };
const globalLocal = globalThis as typeof globalThis & { __liveshotLocal?: LocalRuntime };
const runtime: LocalRuntime = globalLocal.__liveshotLocal ??= { machines: new Map(), queues: new Map() };
const root = path.join(config.dataDir, 'local');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
const truncate = (value: string) => value.length <= 4000 ? value : `${value.slice(0, 1950)}\n… output truncated …\n${value.slice(-2000)}`;
function machine(id: string) {
  const value = runtime.machines.get(id);
  if (!value) throw new Error('Local machine is no longer available');
  return value;
}
async function serial<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = runtime.queues.get(id) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(action);
  runtime.queues.set(id, pending);
  try { return await pending; } finally { if (runtime.queues.get(id) === pending) runtime.queues.delete(id); }
}
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('Unable to allocate shop port')); return; }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}
async function browser() {
  if (!runtime.browser) runtime.browser = chromium.launch({ headless: true }).catch(error => { runtime.browser = undefined; throw error; });
  return runtime.browser;
}
async function stopProcess(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  try { child.kill('SIGTERM'); } catch { return; }
  await Promise.race([new Promise<void>(resolve => child.once('exit', () => resolve())), delay(1500)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
async function createMachine(captureRef?: string): Promise<{ sandboxId: string }> {
  const id = `local-${nanoid(16)}`;
  const directory = path.join(root, id, 'shop');
  let child: ChildProcess | undefined;
  let context: BrowserContext | undefined;
  try {
    await fs.mkdir(path.dirname(directory), { recursive: true });
    await fs.cp(config.shopDir, directory, { recursive: true, filter: source => !['node_modules', 'data', 'logs', '.git'].includes(path.basename(source)) && path.basename(source) !== 'DEMO_NOTES.md' });
    await fs.symlink(path.join(config.shopDir, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    let metadata: { url?: string; checkout?: boolean } = {};
    if (captureRef) {
      const saved = path.join(root, 'captures', captureRef);
      await fs.mkdir(path.join(directory, 'data'), { recursive: true });
      await fs.copyFile(path.join(saved, 'state.json'), path.join(directory, 'data', 'state.json'));
      try { await fs.cp(path.join(saved, 'logs'), path.join(directory, 'logs'), { recursive: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      metadata = JSON.parse(await fs.readFile(path.join(saved, 'page.json'), 'utf8'));
    }
    const port = await freePort();
    child = spawn(process.execPath, ['server.js'], { cwd: directory, env: { ...process.env, PORT: String(port), PERSIST_STATE: '1' }, stdio: 'ignore' });
    let startupError: Error | undefined;
    child.once('error', error => { startupError = error; });
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      if (startupError || child.exitCode !== null) throw new Error('Local shop could not start');
      try { const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) }); if (response.ok) { ready = true; break; } } catch { /* server starting */ }
      await delay(100);
    }
    if (!ready) throw new Error('Local shop startup timed out');
    context = await (await browser()).newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    // Only preserve the path; the old machine's origin belongs to its private server.
    const target = new URL(metadata.url || '/', `http://127.0.0.1:${port}`);
    await page.goto(`http://127.0.0.1:${port}${target.pathname}${target.search}${target.hash}`, { waitUntil: 'networkidle' });
    await page.getByTestId('bag-button').waitFor();
    if (metadata.checkout) await page.getByTestId('bag-button').click();
    await page.evaluate(() => document.fonts.ready);
    runtime.machines.set(id, { id, directory, port, process: child, context, page });
    return { sandboxId: id };
  } catch (error) {
    if (context) await context.close().catch(() => undefined);
    if (child) await stopProcess(child);
    await fs.rm(path.dirname(directory), { recursive: true, force: true });
    throw error;
  }
}
export function localMachineExists(id: string): boolean {
  const value = runtime.machines.get(id);
  return !!value && value.process.exitCode === null && !value.page.isClosed();
}
export async function ensureLocalGolden(): Promise<{ sandboxId: string }> {
  if (runtime.golden) {
    const value = await runtime.golden;
    if (localMachineExists(value.sandboxId)) return value;
    runtime.golden = undefined;
  }
  runtime.golden ??= createMachine().catch(error => { runtime.golden = undefined; throw error; });
  return runtime.golden;
}
const keyNames: Record<string, string> = { enter: 'Enter', backspace: 'Backspace', tab: 'Tab', escape: 'Escape', delete: 'Delete', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', space: 'Space', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', ctrl: 'Control', control: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Meta', cmd: 'Meta' };
const keyName = (value: string) => keyNames[value.toLowerCase()] || value;
const coordinate = (value: number, max: number) => Math.max(0, Math.min(max - 1, Math.round(value)));
async function performInput(current: LocalMachine, event: InputEvent) {
  const { page } = current;
  if (event.type === 'click') await page.mouse.click(coordinate(event.x, 1024), coordinate(event.y, 768), { button: event.button || 'left', clickCount: event.double ? 2 : 1 });
  else if (event.type === 'type') await page.keyboard.type(event.text);
  else if (event.type === 'key') await page.keyboard.press([...(event.modifiers || []).map(keyName), keyName(event.key)].join('+'));
  else { await page.mouse.move(coordinate(event.x, 1024), coordinate(event.y, 768)); await page.mouse.wheel(0, (event.direction === 'up' ? -1 : 1) * (event.amount ?? 3) * 100); }
}
export const localDriver: MachineDriver = {
  mode: 'local',
  async capture(id, captureId) {
    return serial(id, async () => {
      if (!/^[A-Za-z0-9_-]+$/.test(captureId)) throw new Error('Invalid capture token');
      const current = machine(id);
      const destination = path.join(root, 'captures', captureId);
      await fs.mkdir(destination, { recursive: true });
      let state: string;
      try { state = await fs.readFile(path.join(current.directory, 'data', 'state.json'), 'utf8'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; state = JSON.stringify(await (await fetch(`http://127.0.0.1:${current.port}/api/debug/state`)).json()); }
      await fs.writeFile(path.join(destination, 'state.json'), state);
      try { await fs.cp(path.join(current.directory, 'logs'), path.join(destination, 'logs'), { recursive: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const checkout = await current.page.getByTestId('continue-shopping').isVisible();
      await fs.writeFile(path.join(destination, 'page.json'), JSON.stringify({ url: current.page.url(), checkout }));
      return { sourceRef: captureId };
    });
  },
  async spawn(capture: Capture) { return createMachine(capture.sourceRef); },
  async screenshot(id) { return serial(id, async () => ({ base64: (await machine(id).page.screenshot({ type: 'png' })).toString('base64'), mime: 'image/png' })); },
  async input(id, event) { return serial(id, () => performInput(machine(id), event)); },
  async exec(id, command, opts) {
    return serial(id, async () => {
      const current = machine(id);
      const localCommand = command.replace(/localhost:3000\b/g, `localhost:${current.port}`).replace(/127\.0\.0\.1:3000\b/g, `127.0.0.1:${current.port}`).replace(/~\/shop\b/g, quote(current.directory));
      return new Promise<{ exitCode: number; output: string }>(resolve => {
        execCommand(localCommand, { cwd: current.directory, env: { ...process.env, PORT: String(current.port) }, timeout: Math.min(opts?.timeoutSec ?? 20, 180) * 1000, maxBuffer: 2 * 1024 * 1024, shell: '/bin/bash' }, (error, stdout, stderr) => {
          const code = error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
          resolve({ exitCode: code, output: truncate(`${stdout}${stderr}${error?.killed ? '\nCommand timed out.' : ''}`) });
        });
      });
    });
  },
  async destroy(id) {
    return serial(id, async () => {
      const current = runtime.machines.get(id);
      if (!current) return;
      runtime.machines.delete(id);
      await current.context.close().catch(() => undefined);
      await stopProcess(current.process);
      await fs.rm(path.dirname(current.directory), { recursive: true, force: true });
    });
  },
};
