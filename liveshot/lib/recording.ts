import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';
import { ApiError, getCapture, getDriver, getGoldenSession, getSession, publicValue, withMachine } from './backend';
import type { Recording } from './recorder';

export type PublicRecording = Recording & { available: boolean; capturedAt?: number };
const directory = (captureId: string) => path.join(config.dataDir, 'captures', captureId);
const empty = (): PublicRecording => ({ available: false, startedAt: Date.now(), steps: [], console: [], network: [] });

/** Machine origins are private ports; show paths the way a developer reads them in DevTools. */
function shape(recording: Recording): Recording {
  const local = (url: string) => { try { const u = new URL(url); return /^(127\.0\.0\.1|localhost)$/.test(u.hostname) ? `${u.pathname}${u.search}` : url; } catch { return url; } };
  return publicValue({
    ...recording,
    steps: recording.steps.map(s => ({ ...s, url: local(s.url) })),
    network: recording.network.map(n => ({ ...n, url: local(n.url) })),
    console: recording.console.map(c => ({ ...c, text: c.text.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/g, '') })),
  });
}

/** Freeze the golden machine's recording next to the capture. Never fails the capture. */
export async function saveCaptureRecording(goldenSandboxId: string, captureId: string) {
  const driver = getDriver();
  const recording = driver.recording?.(goldenSandboxId);
  if (!recording) return;
  try {
    const dir = directory(captureId);
    await fs.mkdir(dir, { recursive: true });
    const frozen = structuredClone(recording);
    await Promise.all(frozen.steps.filter(s => s.hasThumb).map(async s => { const png = driver.stepThumb?.(goldenSandboxId, s.n); if (png) await fs.writeFile(path.join(dir, `step-${s.n}.png`), png); else s.hasThumb = false; }));
    const initial = driver.stepThumb?.(goldenSandboxId, 0);
    if (initial) await fs.writeFile(path.join(dir, 'step-0.png'), initial); else frozen.initialThumb = false;
    await fs.writeFile(path.join(dir, 'recording.json'), JSON.stringify(frozen));
  } catch (error) { console.error('[liveshot] could not save recording:', error instanceof Error ? error.message : 'unknown error'); }
}

export async function captureRecording(captureId: string): Promise<PublicRecording> {
  const capture = getCapture(captureId);
  try { return { ...shape(JSON.parse(await fs.readFile(path.join(directory(captureId), 'recording.json'), 'utf8'))), available: true, capturedAt: capture.createdAt }; }
  catch { return { ...empty(), capturedAt: capture.createdAt }; }
}

export async function captureStepThumb(captureId: string, n: number): Promise<Buffer> {
  getCapture(captureId);
  if (!Number.isInteger(n) || n < 0) throw new ApiError(400, 'Invalid step.');
  try { return await fs.readFile(path.join(directory(captureId), `step-${n}.png`)); } catch { throw new ApiError(404, 'No screenshot for this step.'); }
}

/** Live recording of one machine: the tester's console or a developer's private copy. */
export function sessionRecording(sessionId: string): PublicRecording {
  const session = getSession(sessionId);
  if (session.status !== 'ready') throw new ApiError(409, 'This copy is not ready.');
  const recording = getDriver().recording?.(session.sandboxId);
  return recording ? { ...shape(recording), available: true } : empty();
}

export async function resetGoldenRecording() {
  const golden = await getGoldenSession();
  const driver = getDriver();
  if (!driver.resetRecording) throw new ApiError(501, 'Recording is only available in local mode.');
  await withMachine(golden.sandboxId, () => driver.resetRecording!(golden.sandboxId));
}
