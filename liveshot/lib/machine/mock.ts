import { nanoid } from 'nanoid';
import type { MachineDriver } from './driver';
const still = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="1024" height="768" fill="#e9e7de"/><text x="70" y="140" font-family="sans-serif" font-size="48">FORM &amp; FIELD</text><text x="70" y="230" font-family="sans-serif" font-size="24">MOCK · Fixed image; inputs are logged.</text></svg>`;
export const mockDriver: MachineDriver = {
  mode: 'mock',
  async screenshot() { return { base64: Buffer.from(still).toString('base64'), mime: 'image/svg+xml' }; },
  async capture(_, captureId) { return { sourceRef: `mock-${captureId}` }; },
  async spawn() { await new Promise(resolve => setTimeout(resolve, 1500)); return { sandboxId: `mock-${nanoid()}` }; },
  async input(_, event) { console.info('Mock input', event); },
  async exec(_, command) { return { exitCode: 0, output: command.includes('debug/state') ? '{}' : 'Mock command output' }; },
  async destroy() {},
};
