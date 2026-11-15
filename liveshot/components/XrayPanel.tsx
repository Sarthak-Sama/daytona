'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface XrayDiff { path: string; before: unknown; after: unknown }
interface XrayData { newLogLines: string[]; stateDiff: XrayDiff[]; ts: number }
interface LogEntry { time: string; what: string; details: [string, string][]; problem: string; isError: boolean; raw: string }

const show = (value: unknown) => value === undefined ? 'undefined' : typeof value === 'string' ? value : JSON.stringify(value);
const isErrorLine = (line: string) => /"status"\s*:\s*5\d\d|"level"\s*:\s*"error"|\.failed"|"stack"|\bstatus[=: ]+5\d\d\b/i.test(line);
/** `cart.items.couponCode` → `cart › items › coupon code` */
const label = (path: string) => path.split('.').map(p => p.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').toLowerCase()).join(' › ');
const words = (action: string) => action.replace(/[._-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
/** Short human value: arrays and objects become counts, long strings are clipped. */
function brief(value: unknown): string {
  if (value === null || value === undefined) return 'nothing';
  if (Array.isArray(value)) return value.length === 0 ? 'empty list' : `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') return `${Object.keys(value).length} fields`;
  const s = show(value);
  return s.length > 40 ? `${s.slice(0, 37)}…` : s;
}

function parseLog(line: string): LogEntry {
  const isError = isErrorLine(line);
  try {
    const { timestamp, stack, action, level, message, error, reason, msg, ...rest } = JSON.parse(line) as Record<string, unknown>;
    void stack; void level;
    const problem = [error, message, reason, msg].find(v => typeof v === 'string' && v) as string | undefined;
    return {
      time: typeof timestamp === 'string' ? timestamp.slice(11, 19) : '',
      what: words(String(action ?? 'server event')),
      details: Object.entries(rest).slice(0, 4).map(([k, v]) => [words(k), brief(v)]),
      problem: problem || '', isError, raw: line,
    };
  } catch { return { time: '', what: line.slice(0, 120), details: [], problem: '', isError, raw: line }; }
}

export default function XrayPanel({ sessionId, refreshKey, live }: { sessionId: string; refreshKey: number; live: boolean }) {
  const [data, setData] = useState<XrayData | null>(null);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const logRef = useRef<HTMLOListElement>(null);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch(`/api/sessions/${sessionId}/xray`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'X-ray is unavailable.');
      setData(body as XrayData); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'X-ray is unavailable.'); }
    finally { inFlight.current = false; }
  }, [sessionId]);

  useEffect(() => { if (live) void load(); }, [live, refreshKey, load]);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [data]);

  const logs = data ? data.newLogLines.map(parseLog) : [];
  const errors = logs.filter(l => l.isError);
  const lastError = errors[errors.length - 1];

  return (
    <section className="rounded-xl border border-white/10 bg-white/[.02] p-4" aria-label="X-ray">
      <h2 className="font-mono text-xs tracking-[.14em] text-stone-300">X-RAY · what happened under the hood since the bug was captured</h2>
      {!live && !data ? <p className="mt-3 text-sm text-stone-500">Wake your copy, then click around. This panel explains what the server did.</p> : !data ? (
        <p className="mt-3 text-sm text-stone-500">{error || 'Reading the server…'}</p>
      ) : (
        <>
          {/* 1. One-line verdict */}
          {lastError ? (
            <div className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 p-3">
              <p className="text-sm font-semibold text-red-200">✗ The server failed: {lastError.what}</p>
              {lastError.problem && <p className="mt-1 text-sm text-red-100/90">Reason: “{lastError.problem}”</p>}
              <p className="mt-1 text-xs text-red-200/60">{errors.length === 1 ? 'This is the bug, reproduced live in your copy.' : `${errors.length} failures since capture. Latest shown.`}</p>
            </div>
          ) : data.stateDiff.length > 0 ? (
            <div className="mt-3 rounded-lg border border-lime-300/30 bg-lime-300/5 p-3 text-sm text-lime-100">✓ No server errors. {data.stateDiff.length} saved value{data.stateDiff.length === 1 ? '' : 's'} changed.</div>
          ) : (
            <div className="mt-3 rounded-lg border border-white/10 p-3 text-sm text-stone-400">Nothing has changed yet. Your copy is exactly at the captured moment. Try the step that broke.</div>
          )}

          {/* 2. What changed in the saved data */}
          {data.stateDiff.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">What changed in the data</h3>
              <ul className="mt-2 space-y-1.5 text-sm">{data.stateDiff.map(d => (
                <li key={d.path} className="rounded-md bg-white/[.03] px-2 py-1.5" title={`${d.path}: ${show(d.before)} → ${show(d.after)}`}>
                  <span className="text-stone-200">{label(d.path)}</span>
                  <span className="text-stone-500">: was </span><span className="text-stone-400">{brief(d.before)}</span>
                  <span className="text-stone-500">, now </span><span className="font-semibold text-lime-200">{brief(d.after)}</span>
                </li>
              ))}</ul>
            </div>
          )}

          {/* 3. Server timeline */}
          {logs.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">What the server did, in order</h3>
              <ol ref={logRef} className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm" aria-label="Server timeline">
                {logs.map((l, i) => (
                  <li key={`${i}-${l.raw}`} title={l.raw} className={`flex gap-2 rounded-md px-2 py-1 ${l.isError ? 'bg-red-500/10 text-red-200' : 'text-stone-300'}`}>
                    <span className="shrink-0">{l.isError ? '✗' : '✓'}</span>
                    <span className="min-w-0 flex-1 break-words">
                      <span className="font-medium">{l.what}</span>
                      {l.problem && <span className="text-red-200/90">: {l.problem}</span>}
                      {l.details.length > 0 && <span className="ml-1 text-xs text-stone-500">({l.details.map(([k, v]) => `${k}: ${v}`).join(', ')})</span>}
                    </span>
                    {l.time && <span className="shrink-0 font-mono text-[11px] text-stone-500">{l.time}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-stone-500">{error}</p>}
        </>
      )}
    </section>
  );
}
