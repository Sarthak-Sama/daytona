import { config } from '../config';
import type { MachineDriver } from './driver';
import { localDriver, ensureLocalGolden } from './local';
import { mockDriver } from './mock';
import { daytonaDriver, getDaytonaGolden } from './daytona';
import { daytonaExecDriver, DX_PREFIX } from './daytona-exec';
function baseDriver(): MachineDriver {
  if (config.mode === 'local') return localDriver;
  if (config.mode === 'mock') return mockDriver;
  return daytonaDriver;
}
// AI_DRIVER=daytona: AI Detective copies (spawn name `ls-ai-…`) run in an exec-only Daytona
// sandbox; everything else stays on the base driver. Dispatch afterwards is by id prefix.
const BLANK_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
function hybrid(base: MachineDriver): MachineDriver {
  const pick = (id: string) => id.startsWith(DX_PREFIX) ? daytonaExecDriver : base;
  return {
    mode: base.mode,
    capture: (golden, captureId) => base.capture(golden, captureId),
    spawn: (capture, name) => name.startsWith('ls-ai-') ? daytonaExecDriver.spawn(capture, name) : base.spawn(capture, name),
    // backend.validSession probes liveness with screenshot(); AI copies have no display, so probe with exec.
    screenshot: async id => {
      if (!id.startsWith(DX_PREFIX)) return base.screenshot(id);
      const probe = await daytonaExecDriver.exec(id, 'true', { timeoutSec: 10 });
      if (probe.exitCode !== 0) throw new Error('AI copy is not reachable');
      return { base64: BLANK_PNG, mime: 'image/png' };
    },
    input: (id, ev) => pick(id).input(id, ev),
    exec: (id, command, opts) => pick(id).exec(id, command, opts),
    destroy: id => pick(id).destroy(id),
    recording: id => base.recording?.(id),
    stepThumb: (id, n) => base.stepThumb?.(id, n),
    resetRecording: base.resetRecording ? id => base.resetRecording!(id) : undefined,
  };
}
let composite: MachineDriver | undefined;
export function getDriver(): MachineDriver {
  const base = baseDriver();
  if (process.env.AI_DRIVER !== 'daytona') return base;
  return composite ??= hybrid(base);
}
export async function getGoldenMachine(): Promise<string> {
  if (config.mode === 'local') return (await ensureLocalGolden()).sandboxId;
  if (config.mode === 'mock') return 'mock-golden';
  return getDaytonaGolden();
}
