import type { Capture, Mode } from '../types';

export interface MachineDriver {
  mode: Mode;
  capture(goldenSandboxId: string, captureId: string): Promise<{ sourceRef: string }>;
  spawn(capture: Capture, name: string): Promise<{ sandboxId: string }>;
  screenshot(sandboxId: string): Promise<{ base64: string; mime: string }>;
  input(sandboxId: string, ev: InputEvent): Promise<void>;
  exec(sandboxId: string, command: string, opts?: { cwd?: string; timeoutSec?: number }):
    Promise<{ exitCode: number; output: string }>;
  destroy(sandboxId: string): Promise<void>;
}

export type InputEvent =
  | { type: 'click'; x: number; y: number; button?: 'left' | 'right'; double?: boolean }
  | { type: 'type'; text: string }
  | { type: 'key'; key: string; modifiers?: string[] }
  | { type: 'scroll'; x: number; y: number; direction: 'up' | 'down'; amount?: number };
