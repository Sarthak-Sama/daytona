'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface XrayDiff { path: string; before: unknown; after: unknown }
interface XrayData { newLogLines: string[]; stateDiff: XrayDiff[]; ts: number }

const show = (value: unknown) => value === undefined ? 'undefined' : typeof value === 'string' ? value : JSON.stringify(value);
const isError = (line: string) => /"status"\s*:\s*5\d\d|"level"\s*:\s*"error"|\.failed"|"stack"|\bstatus[=: ]+5\d\d\b/i.test(line);
/** Compact JSON log lines to `action key=value …` (drops timestamp and stack traces). */
function brief(line: string): string {
  try {
    const { timestamp, stack, action, ...rest } = JSON.parse(line) as Record<string, unknown>;
    void timestamp; void stack;
    const time = typeof timestamp === 'string' ? timestamp.slice(11, 19) + ' ' : '';
    return `${time}${String(action ?? '')} ${Object.entries(rest).map(([k, v]) => `${k}=${show(v)}`).join(' ')}`.trim();
  } catch { return line; }
}

export default function XrayPanel({ sessionId, refreshKey, live }: { sessionId: string; refreshKey: number; live: boolean }) {
  const [data, setData] = useState<XrayData | null>(null);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const logRef = useRef<HTMLUListElement>(null);

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

  return (
    <section className="rounded-xl border border-white/10 bg-white/[.02] p-4" aria-label="X-ray">
      <h2 className="font-mono text-xs tracking-[.14em] text-stone-300">X-RAY · since the captured moment</h2>
      {!live && !data ? <p className="mt-3 text-sm text-stone-500">Wake your copy to see what the server does.</p> : !data ? (
        <p className="mt-3 text-sm text-stone-500">{error || 'Reading the server…'}</p>
      ) : (
        <>
          {data.stateDiff.length === 0
            ? <p className="mt-3 text-sm text-stone-400">Identical to the captured moment.</p>
            : <ul className="mt-3 space-y-1 font-mono text-xs">{data.stateDiff.map(d => (
                <li key={d.path} className="flex flex-wrap gap-x-2 break-all"><span className="text-stone-200">{d.path}</span><span className="text-stone-500 line-through">{show(d.before)}</span><span className="text-stone-500">→</span><span className="text-lime-200">{show(d.after)}</span></li>
              ))}</ul>}
          {data.newLogLines.length > 0 && (
            <ul ref={logRef} className="mt-3 max-h-40 space-y-0.5 overflow-y-auto border-t border-white/10 pt-3 font-mono text-[11px] leading-snug" aria-label="New server log lines">
              {data.newLogLines.map((line, i) => <li key={`${i}-${line}`} className={`break-all ${isError(line) ? 'text-red-300' : 'text-lime-200/80'}`}>{brief(line)}</li>)}
            </ul>
          )}
          {error && <p className="mt-2 text-xs text-stone-500">{error}</p>}
        </>
      )}
    </section>
  );
}
