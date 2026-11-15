// Exec-only Daytona machine for AI Detective copies (hybrid mode).
// No desktop, browser, fork or Computer Use: create, upload, exec, delete.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Sandbox } from '@daytona/sdk';
import { config } from '../config';
import type { MachineDriver } from './driver';
import { daytonaClient } from './daytona';
import { createSandbox, ensureRuntime, uploadShop, checkedExec, sdkCall, startShop, deleteIfPresent } from './provision';

export const DX_PREFIX = 'dx-';
const machines = new Map<string, { sb: Sandbox; shopDir: string }>();
const truncate = (s: string) => s.length <= 4000 ? s : `${s.slice(0, 1950)}\n… output truncated …\n${s.slice(-2000)}`;

async function readOptional(file: string) {
  try { return await fs.readFile(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

async function lookup(id: string) {
  const known = machines.get(id);
  if (known) return known;
  const sb = await sdkCall(() => daytonaClient().get(id.slice(DX_PREFIX.length)), 30_000, true);
  const home = await sdkCall(() => sb.getUserHomeDir(), 30_000, true);
  if (!home) throw new Error('Sandbox did not report a user home directory');
  const entry = { sb, shopDir: `${home}/shop` };
  machines.set(id, entry);
  return entry;
}

export const daytonaExecDriver: Pick<MachineDriver, 'spawn' | 'exec' | 'destroy' | 'screenshot' | 'input'> = {
  async spawn(capture, name) {
    // Local captures keep logs/app.log under .data/local/captures/<ref>; rehydrate captures keep app.log in the absolute sourceRef directory.
    const rehydrated = capture.mode === 'rehydrate';
    const saved = rehydrated ? capture.sourceRef : path.join(config.dataDir, 'local', 'captures', capture.sourceRef);
    const state = await readOptional(path.join(saved, 'state.json'));
    const logs = await readOptional(rehydrated ? path.join(saved, 'app.log') : path.join(saved, 'logs', 'app.log'));
    if (!state) throw new Error('AI_DRIVER=daytona needs a local capture (state.json missing)');
    const sb = await createSandbox(daytonaClient(), { name: `${name}-${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9-]/g, 'x').toLowerCase(), labels: { app: 'liveshot', role: 'ai', captureId: capture.id } });
    try {
      await ensureRuntime(sb);
      const home = await uploadShop(sb); // tars locally without node_modules/logs/data/DEMO_NOTES.md, asserts, extracts, npm ci --omit=dev
      const shopDir = `${home}/shop`;
      await checkedExec(sb, 'mkdir -p data logs', shopDir);
      if (state) await sdkCall(() => sb.fs.uploadFile(state, `${shopDir}/data/state.json`), 30_000);
      if (logs) await sdkCall(() => sb.fs.uploadFile(logs, `${shopDir}/logs/app.log`), 30_000);
      await startShop(sb, home, true);
      const id = `${DX_PREFIX}${sb.id}`;
      machines.set(id, { sb, shopDir });
      return { sandboxId: id };
    } catch (error) {
      await deleteIfPresent(() => sb.delete(60, true));
      throw error;
    }
  },
  async exec(id, command, opts) {
    const { sb, shopDir } = await lookup(id);
    const timeout = opts?.timeoutSec ?? 20;
    const result = await sdkCall(() => sb.process.executeCommand(command, opts?.cwd || shopDir, undefined, timeout), timeout * 1000 + 5000);
    return { exitCode: result.exitCode, output: truncate(result.result || '') };
  },
  async destroy(id) {
    const entry = machines.get(id);
    machines.delete(id);
    if (entry) return deleteIfPresent(() => entry.sb.delete(60, true));
    try { const { sb } = await lookup(id); machines.delete(id); await deleteIfPresent(() => sb.delete(60, true)); }
    catch (error) { if (!(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404)) throw error; }
  },
  async screenshot() { throw new Error('not supported for AI copies'); },
  async input() { throw new Error('not supported for AI copies'); },
};
