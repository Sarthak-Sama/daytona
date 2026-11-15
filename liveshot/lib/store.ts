import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import type { Capture, Investigation, Session } from './types';

interface Store {
  captures: Map<string, Capture>;
  sessions: Map<string, Session>;
  investigations: Map<string, Investigation>;
  prewarmed: Map<string, string>;
  locked: boolean;
  timer?: ReturnType<typeof setTimeout>;
}
declare global { var __liveshot: Store | undefined; }
const storeFile = path.join(config.dataDir, 'store.json');
function load(): Store {
  const result: Store = { captures: new Map(), sessions: new Map(), investigations: new Map(), prewarmed: new Map(), locked: false };
  if (!fs.existsSync(storeFile)) return result;
  try {
    const saved = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    result.captures = new Map(saved.captures || []);
    result.sessions = new Map(saved.sessions || []);
    result.investigations = new Map(saved.investigations || []);
    result.locked = !!saved.locked;
    // Local browser and process handles cannot survive an app restart.
    if (config.mode === 'local' || config.mode === 'mock') {
      for (const session of result.sessions.values()) session.status = 'closed';
      result.locked = false;
    }
    // Spawn jobs are process-local and cannot resume after a restart.
    for (const session of result.sessions.values()) if (session.status === 'starting') session.status = 'closed';
    for (const investigation of result.investigations.values()) {
      if (investigation.status === 'running' || investigation.status === 'starting') {
        investigation.status = 'error';
        investigation.error = 'The app restarted during this investigation. Start a new investigation.';
      }
    }
  } catch { console.warn('Could not load LIVESHOT store; starting with an empty store.'); }
  return result;
}
export const store = globalThis.__liveshot ??= load();
export function flushStore() {
  if (store.timer) clearTimeout(store.timer);
  store.timer = undefined;
  fs.mkdirSync(config.dataDir, { recursive: true });
  const temp = `${storeFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ captures: [...store.captures], sessions: [...store.sessions], investigations: [...store.investigations], locked: store.locked }));
  fs.renameSync(temp, storeFile);
}
export function persistStore() {
  if (store.timer) clearTimeout(store.timer);
  store.timer = setTimeout(flushStore, 200);
}
