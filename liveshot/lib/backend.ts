import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { config } from './config';
import { store, persistStore } from './store';
import { kickFrames } from './frames';
import { getDriver, getGoldenMachine } from './machine';
import type { Capture, Session } from './types';
import type { InputEvent } from './machine/driver';
export { getDriver };

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
interface RuntimeState { chains: Map<string, Promise<unknown>>; active: Map<string, number>; golden?: Promise<Session>; quota: Promise<unknown>; jobs: Map<string, Promise<void>>; validated: Set<string>; }
const globalRuntime = globalThis as typeof globalThis & { __liveshotBackend?: RuntimeState };
const runtime: RuntimeState = globalRuntime.__liveshotBackend ??= { chains: new Map(), active: new Map(), quota: Promise.resolve(), jobs: new Map(), validated: new Set() };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export function redactText(value: string): string {
  let text = value;
  for (const secret of [config.daytonaApiKey, config.llmApiKey, config.daytonaOrganizationId, ...Object.entries(process.env).filter(([name, value]) => /(?:API_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/i.test(name) && (value?.length || 0) >= 6).map(([, value]) => value!)]) if (secret) text = text.split(secret).join('[redacted]');
  for (const session of store.sessions.values()) if (session.sandboxId) text = text.split(session.sandboxId).join('[machine]');
  for (const capture of store.captures.values()) if (capture.sourceRef && capture.sourceRef !== capture.id) text = text.split(capture.sourceRef).join('[capture]');
  text = text.replace(/(?:file:\/\/)?\/(?:Users|home|tmp|private|var|opt|workspace)\/[^\s"'<>:)\\]*/g, '[local path]');
  text = text.split(process.cwd()).join('[app]').split(config.shopDir).join('[shop]').split(config.dataDir).join('[data]');
  return text.replace(/\/(?:Users|home|tmp|private|var|opt|workspace)\/[^\s"'<>:)]*/g, '[local path]');
}
export function publicValue<T>(value: T): T {
  if (typeof value === 'string') return redactText(value) as T;
  if (Array.isArray(value)) return value.map(publicValue) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['sandboxId', 'sourceRef', 'stillPath'].includes(key)).map(([key, entry]) => [key, publicValue(entry)])) as T;
  return value;
}
export function apiError(error: unknown): Response {
  if (!(error instanceof ApiError)) console.error('LIVESHOT API operation failed:', error);
  return Response.json({ error: error instanceof ApiError ? redactText(error.message) : 'The machine operation failed. Please retry.' }, { status: error instanceof ApiError ? error.status : 500 });
}
export async function withMachine<T>(sandboxId: string, fn: () => Promise<T>): Promise<T> {
  const previous = runtime.chains.get(sandboxId) || Promise.resolve();
  const current = previous.catch(() => {}).then(async () => {
    runtime.active.set(sandboxId, (runtime.active.get(sandboxId) || 0) + 1);
    try { return await fn(); } finally { runtime.active.set(sandboxId, (runtime.active.get(sandboxId) || 1) - 1); }
  });
  runtime.chains.set(sandboxId, current);
  try { return await current; } finally { if (runtime.chains.get(sandboxId) === current) runtime.chains.delete(sandboxId); }
}
export function getCapture(id: string): Capture {
  const capture = store.captures.get(id);
  if (!capture) throw new ApiError(404, 'Capture not found.');
  return capture;
}
export function getSession(id: string): Session {
  const session = store.sessions.get(id);
  if (!session) throw new ApiError(404, 'Session not found.');
  return session;
}
async function validSession(session: Session): Promise<boolean> {
  if (session.status !== 'ready' || !session.sandboxId) return false;
  if (runtime.validated.has(session.id)) return true;
  try { await withMachine(session.sandboxId, () => getDriver().screenshot(session.sandboxId)); runtime.validated.add(session.id); return true; }
  catch { session.status = 'closed'; persistStore(); return false; }
}
export async function inspectSession(id: string): Promise<Session> {
  const session = getSession(id);
  if (session.status === 'ready') await validSession(session);
  return session;
}
export async function getGoldenSession(): Promise<Session> {
  if (runtime.golden) return runtime.golden;
  runtime.golden = (async () => {
    const existing = [...store.sessions.values()].find(s => s.kind === 'tester' && s.status === 'ready');
    if (existing && await validSession(existing)) return existing;
    const sandboxId = await getGoldenMachine();
    const session: Session = { id: nanoid(16), captureId: null, kind: 'tester', label: 'Tester', sandboxId, status: 'ready', createdAt: Date.now(), lastInputAt: Date.now() };
    store.sessions.set(session.id, session); runtime.validated.add(session.id); persistStore(); return session;
  })();
  try { return await runtime.golden; } catch (error) { runtime.golden = undefined; throw error; }
}
function investigationRunning(sessionId: string) { return [...store.investigations.values()].some(i => i.sessionId === sessionId && (i.status === 'starting' || i.status === 'running')); }
export async function closeSession(id: string): Promise<void> {
  const session = getSession(id);
  if (session.kind === 'tester') throw new ApiError(409, 'The tester machine cannot be deleted here.');
  if (investigationRunning(id)) throw new ApiError(409, 'This copy has an investigation running.');
  session.status = 'closed';
  for (const [captureId, sessionId] of store.prewarmed) if (sessionId === id) store.prewarmed.delete(captureId);
  persistStore();
  if (session.sandboxId) await withMachine(session.sandboxId, () => getDriver().destroy(session.sandboxId));
}
async function quotaSlot(prewarm: boolean) {
  const live = [...store.sessions.values()].filter(s => s.kind !== 'tester' && (s.status === 'ready' || s.status === 'starting'));
  if (live.length < config.maxLiveSessions) return;
  if (prewarm) throw new ApiError(409, 'No room for a prewarmed copy.');
  const evict = live.filter(s => s.status === 'ready' && !investigationRunning(s.id) && !runtime.chains.has(s.sandboxId)).sort((a, b) => a.lastInputAt - b.lastInputAt)[0];
  if (!evict) throw new ApiError(409, 'All copies are busy. Try again when a copy is idle.');
  await closeSession(evict.id);
}
async function reserveSession(captureId: string, kind: 'human' | 'ai', label?: string, prewarm = false): Promise<Session> {
  const capture = getCapture(captureId);
  let session!: Session;
  const reservation = runtime.quota.catch(() => {}).then(async () => {
    await quotaSlot(prewarm);
    const count = [...store.sessions.values()].filter(s => s.captureId === captureId && s.kind === 'human').length;
    session = { id: nanoid(16), captureId, kind, label: label || (kind === 'ai' ? 'AI Detective' : count ? `Copy ${count + 1}` : 'You'), sandboxId: '', status: 'starting', createdAt: Date.now(), lastInputAt: Date.now() };
    store.sessions.set(session.id, session); if (prewarm) store.prewarmed.set(captureId, session.id); persistStore();
    const job = (async () => {
      try {
        const result = await withMachine(capture.sourceRef, () => getDriver().spawn(capture, `ls-${kind}-${session.id}`));
        session.sandboxId = result.sandboxId;
        if (session.status === 'closed') await getDriver().destroy(result.sandboxId);
        else { session.status = 'ready'; runtime.validated.add(session.id); }
      } catch { session.status = 'error'; session.error = 'Could not wake this copy. Please retry.'; }
      finally { runtime.jobs.delete(session.id); persistStore(); }
    })();
    runtime.jobs.set(session.id, job);
  });
  runtime.quota = reservation;
  await reservation;
  return session;
}
export async function createSession(captureId: string, kind: 'human' | 'ai', label?: string): Promise<Session> {
  getCapture(captureId);
  const id = kind === 'human' ? store.prewarmed.get(captureId) : undefined;
  if (id) {
    store.prewarmed.delete(captureId);
    const session = store.sessions.get(id);
    if (session && (session.status === 'ready' || session.status === 'starting')) { session.lastInputAt = Date.now(); if (label) session.label = label; persistStore(); void prewarmCapture(captureId); return session; }
  }
  const session = await reserveSession(captureId, kind, label);
  return session;
}
export async function prewarmCapture(captureId: string) {
  if (!config.prewarm || store.prewarmed.has(captureId)) return;
  try { await reserveSession(captureId, 'human', undefined, true); } catch { /* Prewarming is opportunistic and never evicts a viewer. */ }
}
export async function waitForSession(id: string): Promise<Session> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const session = getSession(id);
    if (session.status === 'ready') return session;
    if (session.status !== 'starting') throw new ApiError(409, session.error || 'This copy is closed.');
    await sleep(200);
  }
  throw new ApiError(504, 'The copy took too long to start.');
}
function requireReady(id: string) { const session = getSession(id); if (session.status !== 'ready') throw new ApiError(409, 'This copy is not ready.'); return session; }
export async function sessionFrame(id: string) {
  const session = requireReady(id);
  // Read-only: do not queue behind inputs. Stamp the frame when the screenshot starts so a slow poll never overwrites a newer input frame.
  const ts = Date.now(); const frame = await getDriver().screenshot(session.sandboxId); return { image: frame.base64, mime: frame.mime, ts };
}
export async function sessionInput(id: string, event: InputEvent, streamed = false) {
  const session = requireReady(id);
  return withMachine(session.sandboxId, async () => {
    if (session.status !== 'ready') throw new ApiError(409, 'This copy is closed.');
    if (session.kind === 'tester' && store.locked) throw new ApiError(423, 'Captured: this machine is frozen.');
    session.lastInputAt = Date.now(); persistStore();
    // Streaming viewers get the result from the live frame hub: sample while the input is in flight and again when it lands.
    kickFrames(id);
    await getDriver().input(session.sandboxId, event);
    kickFrames(id);
    if (streamed) return { ts: Date.now() };
    await sleep(120);
    const ts = Date.now(); const frame = await getDriver().screenshot(session.sandboxId); return { image: frame.base64, mime: frame.mime, ts };
  });
}
function dimensions(buffer: Buffer, mime: string): { width: number; height: number } {
  if (mime === 'image/png') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1]; const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      offset += length + 2;
    }
  }
  if (mime === 'image/svg+xml') { const s = buffer.toString(); return { width: Number(s.match(/width="(\d+)"/)?.[1]) || 1024, height: Number(s.match(/height="(\d+)"/)?.[1]) || 768 }; }
  throw new Error('Unsupported screenshot dimensions.');
}
export async function captureGolden(note?: string): Promise<Capture> {
  const golden = await getGoldenSession();
  const capture = await withMachine(golden.sandboxId, async () => {
    const driver = getDriver(); const id = nanoid(10);
    const frame = await driver.screenshot(golden.sandboxId); const bytes = Buffer.from(frame.base64, 'base64');
    const size = dimensions(bytes, frame.mime);
    const suffix = frame.mime === 'image/png' ? 'png' : frame.mime === 'image/svg+xml' ? 'svg' : 'jpg';
    const stillPath = path.join(config.dataDir, 'captures', `${id}.${suffix}`);
    await fs.mkdir(path.dirname(stillPath), { recursive: true }); await fs.writeFile(stillPath, bytes);
    const logs = await driver.exec(golden.sandboxId, 'tail -n 200 logs/app.log', { timeoutSec: 10 });
    const state = await driver.exec(golden.sandboxId, `curl -fsS localhost:${driver.mode === 'local' ? '$PORT' : '3000'}/api/debug/state`, { timeoutSec: 10 });
    let debugState: unknown; try { debugState = JSON.parse(state.output); } catch { throw new Error('Could not read captured state.'); }
    const directGolden = config.forkSource === 'golden' && driver.mode === 'fork';
    const sourceRef = directGolden ? golden.sandboxId : (await driver.capture(golden.sandboxId, id)).sourceRef;
    if (directGolden) store.locked = true;
    await import('./recording').then(m => m.saveCaptureRecording(golden.sandboxId, id));
    const result: Capture = { id, createdAt: Date.now(), mode: driver.mode, stillPath, ...size, sourceRef, logsTail: logs.exitCode === 0 ? logs.output : '', debugState, ...(note ? { note } : {}) };
    store.captures.set(id, result); persistStore(); return result;
  });
  void prewarmCapture(capture.id);
  // Fire-and-forget: the diagnosis should arrive with the screenshot, but must never fail or delay the capture response.
  void import('./agent/detective').then(m => m.startInvestigation(capture.id)).catch(error => console.error('[liveshot] auto-investigation failed:', error instanceof Error ? error.message : 'unknown error'));
  return capture;
}
export function captureMetadata(id: string) {
  const capture = getCapture(id);
  const sessions = [...store.sessions.values()].filter(s => s.captureId === id && ![...store.prewarmed.values()].includes(s.id)).map(s => ({ label: s.label, kind: s.kind, status: s.status }));
  const investigation = [...store.investigations.values()].filter(i => i.captureId === id).at(-1);
  return publicValue({ id: capture.id, createdAt: capture.createdAt, mode: capture.mode, width: capture.width, height: capture.height, note: capture.note, logsTail: capture.logsTail, debugState: capture.debugState, sessions, investigationId: investigation?.id });
}
