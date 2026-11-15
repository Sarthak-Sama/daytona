// Live frame hub: one screenshot loop per watched session, fanned out to every subscriber.
// Screenshots are read-only, so they overlap each other and overlap inputs. The loop runs
// hot (overlapping shots) for a few seconds after any input or visible change, and idles at
// about one shot a second otherwise. Identical frames are not re-sent.
import { getDriver, getSession } from './backend';

export interface LiveFrame { image: string; mime: string; ts: number }
type Listener = (frame: LiveFrame | { closed: string } | { same: number }) => void;
interface Hub { watchedAt: number; sessionId: string; listeners: Set<Listener>; last?: LiveFrame; inflight: number; lastStart: number; hotUntil: number; errors: number; timer?: ReturnType<typeof setInterval> }

const HOT_MS = 3000, HOT_GAP = 160, HOT_PARALLEL = 3, IDLE_GAP = 1000, LINGER_MS = 6000, ERROR_GAP = 2000, MAX_ERRORS = 8;
const globalHubs = globalThis as typeof globalThis & { __liveshotFrames?: Map<string, Hub> };
const hubs = globalHubs.__liveshotFrames ??= new Map<string, Hub>();

function stop(hub: Hub, reason?: string) {
  if (hub.timer) clearInterval(hub.timer);
  hub.timer = undefined;
  if (reason) for (const listener of hub.listeners) listener({ closed: reason });
  if (reason || !hub.listeners.size) hubs.delete(hub.sessionId);
}

function shoot(hub: Hub) {
  let sandboxId: string;
  try {
    const session = getSession(hub.sessionId);
    if (session.status !== 'ready') return stop(hub, 'This copy is closed.');
    sandboxId = session.sandboxId;
  } catch { return stop(hub, 'This copy is closed.'); }
  const ts = Date.now();
  hub.inflight++; hub.lastStart = ts;
  getDriver().screenshot(sandboxId).then(frame => {
    hub.errors = 0;
    // Stamped at screenshot start: a slow shot never replaces a newer one.
    if (hub.last && ts <= hub.last.ts) return;
    const changed = !hub.last || hub.last.image !== frame.base64;
    hub.last = { image: frame.base64, mime: frame.mime, ts };
    // Unchanged screen: tell viewers how fresh their picture is without resending it.
    if (!changed) { for (const listener of hub.listeners) listener({ same: ts }); return; }
    // The screen is moving (an animation, a response landing): keep sampling quickly.
    hub.hotUntil = Math.max(hub.hotUntil, Date.now() + 1500);
    for (const listener of hub.listeners) listener(hub.last);
  }).catch(() => {
    if (++hub.errors >= MAX_ERRORS) stop(hub, 'The machine stopped responding.');
  }).finally(() => { hub.inflight--; });
}

function tick(hub: Hub) {
  // Long-poll viewers come and go between requests: keep the loop warm for a few seconds.
  if (!hub.listeners.size && Date.now() - hub.watchedAt > LINGER_MS) return stop(hub);
  const now = Date.now(), hot = now < hub.hotUntil;
  const gap = hub.errors ? ERROR_GAP : hot ? HOT_GAP : IDLE_GAP;
  const parallel = hot && !hub.errors ? HOT_PARALLEL : 1;
  if (hub.inflight < parallel && now - hub.lastStart >= gap) shoot(hub);
}

function watch(sessionId: string): Hub {
  let hub = hubs.get(sessionId);
  if (!hub) { hub = { sessionId, listeners: new Set(), inflight: 0, lastStart: 0, hotUntil: Date.now() + 1000, errors: 0, watchedAt: Date.now() }; hubs.set(sessionId, hub); }
  hub.watchedAt = Date.now();
  const current = hub;
  if (!current.timer) { current.timer = setInterval(() => tick(current), 40); tick(current); }
  return current;
}

// Long-poll: resolves as soon as the session has a frame newer than `after`.
// While the loop is hot it also resolves on "unchanged" so viewers can confirm an input has landed.
export function nextFrame(sessionId: string, after: number, signal?: AbortSignal, timeoutMs = 20000): Promise<LiveFrame | { same: number } | { closed: string }> {
  const hub = watch(sessionId);
  if (hub.last && hub.last.ts > after) return Promise.resolve(hub.last);
  return new Promise(resolve => {
    const finish = (value: LiveFrame | { same: number } | { closed: string }) => { clearTimeout(timer); hub.listeners.delete(listener); hub.watchedAt = Date.now(); signal?.removeEventListener('abort', abort); resolve(value); };
    const listener: Listener = frame => {
      if ('same' in frame) { if (frame.same > after && Date.now() < hub.hotUntil) finish(frame); return; }
      finish(frame);
    };
    const abort = () => finish({ same: after });
    const timer = setTimeout(() => finish({ same: Math.max(after, hub.last?.ts || 0) }), timeoutMs);
    signal?.addEventListener('abort', abort);
    hub.listeners.add(listener);
  });
}

// Called around every input: sample immediately and stay hot while the result lands.
export function kickFrames(sessionId: string) {
  const hub = hubs.get(sessionId);
  if (!hub || !hub.timer) return;
  hub.hotUntil = Date.now() + HOT_MS;
  if (hub.inflight < HOT_PARALLEL) shoot(hub);
}
