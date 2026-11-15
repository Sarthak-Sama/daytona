import { config } from '../config';
import type { MachineDriver } from './driver';
import { localDriver, ensureLocalGolden } from './local';
import { mockDriver } from './mock';
import { daytonaDriver, getDaytonaGolden } from './daytona';
export function getDriver(): MachineDriver {
  if (config.mode === 'local') return localDriver;
  if (config.mode === 'mock') return mockDriver;
  return daytonaDriver;
}
export async function getGoldenMachine(): Promise<string> {
  if (config.mode === 'local') return (await ensureLocalGolden()).sandboxId;
  if (config.mode === 'mock') return 'mock-golden';
  return getDaytonaGolden();
}
