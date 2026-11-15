import type { Page } from 'playwright';
import type { InputEvent } from './machine/driver';

/** What the user acted on, resolved from the DOM at the moment of the action. */
export interface StepTarget { label: string; testId?: string; role?: string; tag: string; text?: string }
export interface RecordedStep {
  n: number; t: number; url: string;
  action: 'click' | 'type' | 'key' | 'scroll' | 'navigate' | 'back' | 'forward' | 'reload';
  x?: number; y?: number; text?: string; key?: string; direction?: 'up' | 'down';
  target?: StepTarget;
  hasThumb?: boolean;
}
export interface ConsoleEntry { id: number; t: number; level: 'log' | 'info' | 'warn' | 'error' | 'debug'; text: string; source?: string; stack?: string }
export interface NetworkEntry {
  id: number; t: number; method: string; url: string; resourceType: string;
  status?: number; statusText?: string; ms?: number; failure?: string;
  requestBody?: string; responseBody?: string; mime?: string;
}
export interface Recording { startedAt: number; steps: RecordedStep[]; console: ConsoleEntry[]; network: NetworkEntry[]; initialThumb?: boolean }

const LIMIT = 500, BODY_LIMIT = 8_000;
const clip = (value: string, max = BODY_LIMIT) => value.length <= max ? value : `${value.slice(0, max)}\n… ${value.length - max} more bytes`;
const levels: Record<string, ConsoleEntry['level']> = { warning: 'warn', error: 'error', info: 'info', debug: 'debug', log: 'log' };

/** Records steps, console and network for one Playwright page. One instance per machine. */
export class Recorder {
  recording: Recording = { startedAt: Date.now(), steps: [], console: [], network: [] };
  thumbs = new Map<number, Buffer>();
  private seq = 0;
  /** Step whose screenshot is still owed; 0 is the screen before the first step. */
  private pendingThumb?: number = 0;
  private requests = new WeakMap<object, NetworkEntry>();

  constructor(private page: Page) {
    page.on('console', message => {
      const location = message.location();
      this.push(this.recording.console, { id: ++this.seq, t: Date.now(), level: levels[message.type()] || 'log', text: clip(message.text(), 4000), source: location.url ? `${new URL(location.url).pathname}:${location.lineNumber + 1}` : undefined });
    });
    page.on('pageerror', error => {
      this.push(this.recording.console, { id: ++this.seq, t: Date.now(), level: 'error', text: `Uncaught ${error.name}: ${error.message}`, stack: clip(error.stack || '', 4000) });
    });
    page.on('request', request => {
      const type = request.resourceType();
      if (!['fetch', 'xhr', 'document'].includes(type)) return;
      const entry: NetworkEntry = { id: ++this.seq, t: Date.now(), method: request.method(), url: request.url(), resourceType: type, requestBody: request.postData() ? clip(request.postData()!) : undefined };
      this.requests.set(request, entry);
      this.push(this.recording.network, entry);
    });
    page.on('requestfinished', async request => {
      const entry = this.requests.get(request); if (!entry) return;
      entry.ms = Date.now() - entry.t;
      try {
        const response = await request.response(); if (!response) return;
        entry.status = response.status(); entry.statusText = response.statusText();
        entry.mime = response.headers()['content-type']?.split(';')[0];
        if (entry.resourceType !== 'document' && /json|text/.test(entry.mime || '')) entry.responseBody = clip(await response.text());
      } catch { /* the page navigated away before the body was read */ }
    });
    page.on('requestfailed', request => {
      const entry = this.requests.get(request); if (!entry) return;
      entry.ms = Date.now() - entry.t; entry.failure = request.failure()?.errorText || 'failed';
    });
    page.on('framenavigated', frame => {
      if (frame !== page.mainFrame()) return;
      const last = this.recording.steps.at(-1);
      if (last?.action === 'navigate' && last.url === frame.url()) return;
      // Navigations caused by a step stay attached to that step; only record standalone ones.
      if (last && Date.now() - last.t < 1500) return;
      this.addStep({ action: 'navigate', url: frame.url() });
    });
  }

  private push<T>(list: T[], value: T) { list.push(value); if (list.length > LIMIT) list.splice(0, list.length - LIMIT); }
  private addStep(step: Omit<RecordedStep, 'n' | 't'>) {
    const n = (this.recording.steps.at(-1)?.n ?? 0) + 1;
    const value: RecordedStep = { n, t: Date.now(), ...step };
    this.push(this.recording.steps, value);
    return value;
  }

  reset() { this.recording = { startedAt: Date.now(), steps: [], console: [], network: [] }; this.thumbs.clear(); this.pendingThumb = 0; }

  /** Call before the action is performed so the target is described as the user saw it. */
  async beforeInput(event: InputEvent) {
    // Consecutive typing into the same field is one step.
    const last = this.recording.steps.at(-1);
    if (event.type === 'type' && last?.action === 'type' && Date.now() - last.t < 4000) { last.text = (last.text || '') + event.text; last.t = Date.now(); this.pendingThumb = last.n; return; }
    if (event.type === 'scroll' && last?.action === 'scroll' && last.direction === event.direction && Date.now() - last.t < 2000) { last.t = Date.now(); this.pendingThumb = last.n; return; }
    const target = event.type === 'nav' ? undefined : await describe(this.page, 'x' in event ? { x: event.x, y: event.y } : undefined).catch(() => undefined);
    const base = { url: this.page.url(), target };
    const step = event.type === 'click' ? this.addStep({ ...base, action: 'click', x: event.x, y: event.y })
      : event.type === 'type' ? this.addStep({ ...base, action: 'type', text: event.text })
      : event.type === 'nav' ? this.addStep({ url: this.page.url(), action: event.action })
      : event.type === 'key' ? this.addStep({ ...base, action: 'key', key: [...(event.modifiers || []), event.key].join('+') })
      : this.addStep({ ...base, action: 'scroll', x: event.x, y: event.y, direction: event.direction });
    this.pendingThumb = step.n;
  }

  /** The first frame taken after a step becomes that step's thumbnail. */
  frame(png: Buffer) {
    if (this.pendingThumb === undefined) return;
    this.thumbs.set(this.pendingThumb, png);
    if (this.pendingThumb === 0) this.recording.initialThumb = true;
    const step = this.recording.steps.find(s => s.n === this.pendingThumb); if (step) step.hasThumb = true;
    this.pendingThumb = undefined;
  }
}

async function describe(page: Page, point?: { x: number; y: number }): Promise<StepTarget | undefined> {
  return page.evaluate(point => {
    const raw = point ? document.elementFromPoint(point.x, point.y) : document.activeElement;
    if (!raw || raw === document.body) return undefined;
    const el = (raw.closest('[data-testid],button,a,input,select,textarea,label,[role]') || raw) as HTMLElement;
    const testId = el.closest('[data-testid]')?.getAttribute('data-testid') || undefined;
    const tag = el.tagName.toLowerCase();
    const aria = el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || '';
    const text = (el.innerText || (el as HTMLInputElement).value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const role = el.getAttribute('role') || (tag === 'button' ? 'button' : tag === 'a' ? 'link' : ['input', 'textarea'].includes(tag) ? 'textbox' : undefined);
    const label = aria || text || testId || tag;
    return { label, testId, role, tag, text: text || undefined };
  }, point);
}
