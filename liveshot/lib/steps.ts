// Browser-safe helpers for turning a recording into something a developer reads or runs.
import type { ConsoleEntry, NetworkEntry, RecordedStep, Recording } from './recorder';
export type { ConsoleEntry, NetworkEntry, RecordedStep, Recording };

// Buttons often end in decorative glyphs ("Apply ↗"); they add nothing to a step description.
const clean = (value: string) => value.replace(/\s*[↗↘→←⏎›»+]+\s*$/u, '').trim() || value;
const quoted = (raw: string) => { const value = clean(raw); return `“${value.length > 40 ? `${value.slice(0, 40)}…` : value}”`; };
const fieldName = (step: RecordedStep) => step.target ? quoted(step.target.label) : 'the page';

export function describeStep(step: RecordedStep): string {
  switch (step.action) {
    case 'click': return step.target ? `Click ${quoted(step.target.label)}` : `Click at ${step.x}, ${step.y}`;
    case 'type': return `Type ${quoted(step.text || '')}${step.target ? ` into ${fieldName(step)}` : ''}`;
    case 'key': return `Press ${step.key?.replace(/\b\w/g, c => c.toUpperCase())}`;
    case 'scroll': return `Scroll ${step.direction}`;
    case 'navigate': return `Open ${step.url}`;
    case 'back': return 'Go back';
    case 'forward': return 'Go forward';
    case 'reload': return 'Reload the page';
  }
}

/** Which step caused each console line and request: the latest step at or before it (0 = page load). */
export function stepOf(t: number, steps: RecordedStep[]): number {
  let n = 0;
  for (const step of steps) { if (step.t <= t + 50) n = step.n; else break; }
  return n;
}

export const isFailure = (entry: NetworkEntry) => !!entry.failure || (entry.status ?? 0) >= 400;

export interface StepSignal { errors: number; failures: NetworkEntry[] }
export function stepSignals(recording: Recording): Map<number, StepSignal> {
  const map = new Map<number, StepSignal>();
  const get = (n: number) => { let v = map.get(n); if (!v) map.set(n, v = { errors: 0, failures: [] }); return v; };
  for (const entry of recording.console) if (entry.level === 'error') get(stepOf(entry.t, recording.steps)).errors++;
  for (const entry of recording.network) if (isFailure(entry)) get(stepOf(entry.t, recording.steps)).failures.push(entry);
  return map;
}

/** The first step where something went wrong: where a developer should look. */
export function bugStep(recording: Recording): number | undefined {
  const signals = stepSignals(recording);
  return [...signals.keys()].filter(n => n > 0).sort((a, b) => a - b)[0];
}

const js = (value: string) => JSON.stringify(value);
function locator(step: RecordedStep): string | undefined {
  const target = step.target; if (!target) return undefined;
  if (target.testId) return `page.getByTestId(${js(target.testId)})`;
  if (target.role && target.label && target.label !== target.tag) return `page.getByRole(${js(target.role)}, { name: ${js(target.label)} })`;
  if (target.text) return `page.getByText(${js(target.text)}, { exact: true })`;
  return undefined;
}

/** A runnable Playwright test that walks the tester's steps and fails where the bug appears. */
export function playwrightTest(recording: Recording, options: { title: string; baseUrl?: string }): string {
  const base = options.baseUrl || 'http://localhost:3000';
  const first = recording.steps.find(s => s.url)?.url || '/';
  const lines = [
    `import { test, expect } from '@playwright/test';`,
    ``,
    `// Recorded by LIVESHOT. Start the app with an empty cart (POST /api/debug/reset).`,
    `test(${js(options.title)}, async ({ page }) => {`,
    `  const consoleErrors: string[] = [];`,
    `  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });`,
    `  await page.setViewportSize({ width: 1024, height: 768 });`,
    `  await page.goto(${js(new URL(first, base).href)});`,
  ];
  for (const step of recording.steps) {
    const failures = recording.network.filter(n => isFailure(n) && stepOf(n.t, recording.steps) === step.n && n.resourceType !== 'document');
    lines.push(``, `  // ${step.n}. ${describeStep(step)}`);
    const watch = failures[0];
    if (watch) lines.push(`  const response${step.n} = page.waitForResponse(r => r.url().endsWith(${js(new URL(watch.url, base).pathname)}) && r.request().method() === ${js(watch.method)});`);
    const target = locator(step);
    if (step.action === 'click') lines.push(target ? `  await ${target}.click();` : `  await page.mouse.click(${step.x}, ${step.y});`);
    else if (step.action === 'type') lines.push(`  await page.keyboard.type(${js(step.text || '')});`);
    else if (step.action === 'key') lines.push(`  await page.keyboard.press(${js((step.key || '').split('+').map(k => ({ enter: 'Enter', backspace: 'Backspace', tab: 'Tab', escape: 'Escape', ctrl: 'Control', meta: 'Meta', alt: 'Alt', shift: 'Shift', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } as Record<string, string>)[k] || k).join('+'))});`);
    else if (step.action === 'scroll') lines.push(`  await page.mouse.wheel(0, ${step.direction === 'up' ? -300 : 300});`);
    else if (step.action === 'back') lines.push(`  await page.goBack();`);
    else if (step.action === 'forward') lines.push(`  await page.goForward();`);
    else if (step.action === 'reload') lines.push(`  await page.reload();`);
    else if (step.action === 'navigate') lines.push(`  await page.goto(${js(new URL(step.url, base).href)});`);
    if (watch) lines.push(`  // The tester saw ${watch.method} ${new URL(watch.url, base).pathname} → ${watch.status ?? watch.failure}`, `  expect((await response${step.n}).status(), ${js(`${watch.method} ${new URL(watch.url, base).pathname}`)}).toBeLessThan(400);`);
  }
  lines.push(``, `  expect(consoleErrors, 'console errors').toEqual([]);`, `});`, ``);
  return lines.join('\n');
}

export function relativeTime(t: number, start: number) {
  const s = Math.max(0, (t - start) / 1000);
  return s < 60 ? `+${s.toFixed(1)}s` : `+${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`;
}

/** A paste-ready issue body: steps, what broke, and a link back to the live moment. */
export function markdownReport(recording: Recording, options: { title: string; link: string; capturedAt?: number }): string {
  const signals = stepSignals(recording);
  const errors = recording.console.filter(c => c.level === 'error');
  const failures = recording.network.filter(isFailure);
  const lines = [`## ${options.title}`, ``, `**Open the live moment:** ${options.link}`, `_Click into the screenshot to get a private copy of the app in this exact state._`, ``, `### Steps to reproduce`];
  recording.steps.forEach((step, i) => {
    const signal = signals.get(step.n);
    const flags = [signal?.failures.map(f => `${f.method} ${f.url} → ${f.status ?? f.failure}`).join(', '), signal?.errors ? `${signal.errors} console error${signal.errors > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
    lines.push(`${i + 1}. ${describeStep(step)}${flags ? ` — ⚠️ ${flags}` : ''}`);
  });
  if (failures.length) { lines.push(``, `### Failed requests`); for (const f of failures) lines.push(`- \`${f.method} ${f.url}\` → **${f.status ?? f.failure}**${f.responseBody ? `\n  \`\`\`json\n  ${f.responseBody.slice(0, 600).replace(/\n/g, '\n  ')}\n  \`\`\`` : ''}`); }
  if (errors.length) { lines.push(``, `### Console errors`, '```'); for (const e of errors) lines.push(`${e.text}${e.source ? `  (${e.source})` : ''}`); lines.push('```'); }
  if (options.capturedAt) lines.push(``, `_Captured ${new Date(options.capturedAt).toISOString()} with LIVESHOT._`);
  return lines.join('\n');
}
