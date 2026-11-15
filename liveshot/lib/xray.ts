import { ApiError, getCapture, getDriver, getSession, publicValue, withMachine } from './backend';

export interface XrayDiff { path: string; before: unknown; after: unknown }
export interface XrayResult { newLogLines: string[]; stateDiff: XrayDiff[]; ts: number }

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Shallow-recursive JSON diff with dotted paths (arrays are compared as whole values). */
export function diffState(before: unknown, after: unknown, prefix = ''): XrayDiff[] {
  if (isObject(before) && isObject(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => diffState(before[key], after[key], prefix ? `${prefix}.${key}` : key));
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  return [{ path: prefix || '(root)', before: before === undefined ? null : before, after: after === undefined ? null : after }];
}

export async function sessionXray(id: string): Promise<XrayResult> {
  const session = getSession(id);
  if (!session.captureId) throw new ApiError(400, 'X-ray is only available for copies of a captured moment.');
  const capture = getCapture(session.captureId);
  if (session.status !== 'ready') throw new ApiError(409, 'This copy is not ready.');
  const { logs, state } = await withMachine(session.sandboxId, async () => {
    const driver = getDriver();
    const logs = await driver.exec(session.sandboxId, 'tail -n 40 logs/app.log', { timeoutSec: 10 });
    const state = await driver.exec(session.sandboxId, 'curl -s localhost:3000/api/debug/state', { timeoutSec: 10 });
    return { logs, state };
  });
  const captured = new Set(capture.logsTail.split('\n').map(line => line.trim()).filter(Boolean));
  const newLogLines = (logs.exitCode === 0 ? logs.output : '').split('\n').map(line => line.trim()).filter(line => line && !captured.has(line));
  let current: unknown; try { current = JSON.parse(state.output); } catch { throw new ApiError(502, 'Could not read the current state of this copy.'); }
  return publicValue({ newLogLines, stateDiff: diffState(capture.debugState, current), ts: Date.now() });
}
