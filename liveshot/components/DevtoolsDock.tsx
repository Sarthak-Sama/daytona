'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isFailure, relativeTime, stepOf, type ConsoleEntry, type NetworkEntry, type Recording } from '@/lib/steps';

export type DockTab = 'console' | 'network' | 'server' | 'detective';
type Props = {
  recording?: Recording & { available?: boolean }; source: 'tester' | 'live'; onSource?: (source: 'tester' | 'live') => void; liveAvailable?: boolean;
  selectedStep?: number; onSelectStep?: (n: number) => void;
  tab: DockTab; onTab: (tab: DockTab) => void;
  server?: ReactNode; detective?: ReactNode; detectiveBadge?: ReactNode;
  expanded: boolean; onToggle: () => void;
};

const pretty = (value?: string) => { if (!value) return ''; try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; } };
const levelStyle: Record<ConsoleEntry['level'], string> = { error: 'bg-red-500/[.07] text-red-200 border-red-400/15', warn: 'bg-amber-400/[.06] text-amber-100 border-amber-300/15', info: 'text-sky-200 border-white/[.06]', log: 'text-stone-300 border-white/[.06]', debug: 'text-stone-500 border-white/[.06]' };
const levelIcon: Record<ConsoleEntry['level'], string> = { error: '✕', warn: '▲', info: 'i', log: '›', debug: '·' };

export default function DevtoolsDock(props: Props) {
  const { recording, tab, onTab, expanded, onToggle, source, onSource, liveAvailable } = props;
  const errors = recording?.console.filter(c => c.level === 'error').length ?? 0;
  const failed = recording?.network.filter(isFailure).length ?? 0;
  const tabs: { id: DockTab; label: string; badge?: ReactNode }[] = [
    { id: 'console', label: 'Console', badge: errors ? <span className="rounded-full bg-red-500/20 px-1.5 text-[10px] text-red-200">{errors}</span> : null },
    { id: 'network', label: 'Network', badge: failed ? <span className="rounded-full bg-red-500/20 px-1.5 text-[10px] text-red-200">{failed} failed</span> : recording?.network.length ? <span className="text-[10px] text-stone-500">{recording.network.length}</span> : null },
    { id: 'server', label: 'Server' },
    { id: 'detective', label: 'AI Detective', badge: props.detectiveBadge },
  ];
  return <section aria-label="Developer tools" className="flex min-h-0 flex-col border-t border-white/10 bg-[#0c0d0d]">
    <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 px-2">
      {tabs.map(t => <button key={t.id} onClick={() => { onTab(t.id); if (!expanded) onToggle(); }} className={`flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-xs transition ${tab === t.id && expanded ? 'border-lime-300 text-stone-100' : 'border-transparent text-stone-400 hover:text-stone-200'}`}>{t.label}{t.badge}</button>)}
      <div className="ml-auto flex shrink-0 items-center gap-2 pl-3">
        {(tab === 'console' || tab === 'network') && <div role="group" aria-label="Recording source" className="flex rounded-md border border-white/10 p-0.5 font-mono text-[10px] tracking-wide">
          <button onClick={() => onSource?.('tester')} className={`rounded px-2 py-1 ${source === 'tester' ? 'bg-white/10 text-stone-100' : 'text-stone-500 hover:text-stone-300'}`}>TESTER’S SESSION</button>
          <button disabled={!liveAvailable} onClick={() => onSource?.('live')} title={liveAvailable ? undefined : 'Take control of the screenshot to get your own live copy'} className={`flex items-center gap-1.5 rounded px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40 ${source === 'live' ? 'bg-lime-300/15 text-lime-100' : 'text-stone-500 hover:text-stone-300'}`}><span className={`h-1.5 w-1.5 rounded-full ${liveAvailable ? 'animate-pulse bg-lime-300' : 'bg-stone-600'}`} />YOUR COPY</button>
        </div>}
        <button onClick={onToggle} aria-label={expanded ? 'Collapse developer tools' : 'Expand developer tools'} className="flex h-7 w-7 items-center justify-center rounded text-stone-400 hover:bg-white/5 hover:text-stone-100">{expanded ? '▾' : '▴'}</button>
      </div>
    </div>
    {expanded && <div className="min-h-0 flex-1 overflow-hidden">
      {tab === 'console' && <ConsolePanel {...props} />}
      {tab === 'network' && <NetworkPanel {...props} />}
      {tab === 'server' && <div className="h-full overflow-auto p-4">{props.server}</div>}
      {tab === 'detective' && <div className="h-full overflow-auto p-4">{props.detective}</div>}
    </div>}
  </section>;
}

function StepChip({ n, active, onClick }: { n: number; active: boolean; onClick?: () => void }) {
  return <button onClick={onClick} title={n ? `Caused by step ${n}` : 'During page load'} className={`w-9 shrink-0 rounded px-1 py-0.5 text-center font-mono text-[10px] transition ${active ? 'bg-lime-300 text-black' : 'bg-white/5 text-stone-400 hover:bg-white/10'}`}>{n ? `#${n}` : 'load'}</button>;
}

function useScrollToStep(selectedStep: number | undefined, deps: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (selectedStep === undefined) return; ref.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [selectedStep, deps]);
  return ref;
}

function ConsolePanel({ recording, selectedStep, onSelectStep }: Props) {
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all');
  const [query, setQuery] = useState('');
  const steps = recording?.steps ?? [];
  const rows = useMemo(() => (recording?.console ?? []).filter(c => (filter === 'all' || c.level === filter) && (!query || c.text.toLowerCase().includes(query.toLowerCase()))), [recording, filter, query]);
  const ref = useScrollToStep(selectedStep, rows.length);
  return <div className="flex h-full flex-col">
    <div className="flex shrink-0 items-center gap-2 border-b border-white/[.06] px-3 py-1.5">
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter" aria-label="Filter console" className="h-7 w-44 rounded border border-white/10 bg-white/[.03] px-2 text-xs outline-none placeholder:text-stone-600 focus:border-lime-300/40" />
      {(['all', 'error', 'warn'] as const).map(f => <button key={f} onClick={() => setFilter(f)} className={`rounded px-2 py-1 text-[11px] ${filter === f ? 'bg-white/10 text-stone-100' : 'text-stone-500 hover:text-stone-300'}`}>{f === 'all' ? 'All levels' : f === 'error' ? 'Errors' : 'Warnings'}</button>)}
    </div>
    <div ref={ref} className="min-h-0 flex-1 overflow-auto font-mono text-[12px]">
      {!recording?.available ? <Empty text="No browser recording for this capture. Recording is available in local mode." /> : !rows.length ? <Empty text={query || filter !== 'all' ? 'Nothing matches this filter.' : 'The console stayed quiet.'} /> : rows.map(entry => {
        const n = stepOf(entry.t, steps); const active = selectedStep === n;
        return <div key={entry.id} data-active={active} className={`flex items-start gap-3 border-b px-3 py-1.5 ${levelStyle[entry.level]} ${active ? 'shadow-[inset_2px_0_0_#bef264]' : ''}`}>
          <StepChip n={n} active={active} onClick={() => onSelectStep?.(n)} />
          <span className="w-3 shrink-0 text-center opacity-70">{levelIcon[entry.level]}</span>
          <div className="min-w-0 flex-1"><p className="whitespace-pre-wrap break-words">{entry.text}</p>{entry.stack && <details className="mt-1 text-stone-500"><summary className="text-[11px]">stack</summary><pre className="whitespace-pre-wrap text-[11px]">{entry.stack}</pre></details>}</div>
          {entry.source && <span className="shrink-0 truncate text-[11px] text-stone-500 underline decoration-stone-700">{entry.source}</span>}
          <span className="w-14 shrink-0 text-right text-[10px] text-stone-600">{relativeTime(entry.t, recording.startedAt)}</span>
        </div>;
      })}
    </div>
  </div>;
}

function NetworkPanel({ recording, selectedStep, onSelectStep }: Props) {
  const [selected, setSelected] = useState<number>();
  const [onlyFailed, setOnlyFailed] = useState(false);
  const steps = recording?.steps ?? [];
  const rows = (recording?.network ?? []).filter(n => !onlyFailed || isFailure(n));
  const ref = useScrollToStep(selectedStep, rows.length);
  const current = rows.find(r => r.id === selected);
  useEffect(() => { // Selecting a step opens its first failed request, else its first request.
    if (selectedStep === undefined) return;
    const mine = rows.filter(r => stepOf(r.t, steps) === selectedStep);
    const pick = mine.find(isFailure) || mine[0];
    if (pick) setSelected(pick.id);
  }, [selectedStep]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="flex h-full flex-col">
    <div className="flex shrink-0 items-center gap-2 border-b border-white/[.06] px-3 py-1.5 text-[11px]">
      <button onClick={() => setOnlyFailed(false)} className={`rounded px-2 py-1 ${!onlyFailed ? 'bg-white/10 text-stone-100' : 'text-stone-500 hover:text-stone-300'}`}>Fetch/XHR & documents</button>
      <button onClick={() => setOnlyFailed(true)} className={`rounded px-2 py-1 ${onlyFailed ? 'bg-white/10 text-stone-100' : 'text-stone-500 hover:text-stone-300'}`}>Failed only</button>
      <span className="ml-auto font-mono text-stone-600">{rows.length} requests</span>
    </div>
    <div className="flex min-h-0 flex-1">
      <div ref={ref} className={`min-h-0 overflow-auto ${current ? 'hidden w-[46%] md:block' : 'w-full'}`}>
        {!recording?.available ? <Empty text="No browser recording for this capture. Recording is available in local mode." /> : !rows.length ? <Empty text="No requests recorded." /> : <table className="w-full table-fixed font-mono text-[12px]">
          <thead className="sticky top-0 bg-[#0c0d0d] text-left text-[10px] uppercase tracking-wider text-stone-500"><tr><th className="w-12 py-1.5 pl-3 font-normal">Step</th><th className="w-14 font-normal">Status</th><th className="w-16 font-normal">Method</th><th className="font-normal">Name</th><th className="hidden w-16 font-normal lg:table-cell">Type</th><th className="w-16 pr-3 text-right font-normal">Time</th></tr></thead>
          <tbody>{rows.map(entry => {
            const n = stepOf(entry.t, steps); const bad = isFailure(entry); const active = selectedStep === n;
            return <tr key={entry.id} data-active={active} onClick={() => setSelected(entry.id)} className={`cursor-pointer border-b border-white/[.05] ${selected === entry.id ? 'bg-lime-300/10' : bad ? 'bg-red-500/[.07] hover:bg-red-500/10' : 'hover:bg-white/[.03]'} ${active ? 'shadow-[inset_2px_0_0_#bef264]' : ''}`}>
              <td className="py-1.5 pl-3"><StepChip n={n} active={active} onClick={() => onSelectStep?.(n)} /></td>
              <td className={bad ? 'text-red-300' : entry.status ? 'text-stone-300' : 'text-stone-500'}>{entry.status ?? (entry.failure ? 'failed' : '…')}</td>
              <td className="text-stone-400">{entry.method}</td>
              <td className={`truncate ${bad ? 'text-red-200' : 'text-stone-200'}`} title={entry.url}>{entry.url}</td>
              <td className="hidden text-stone-500 lg:table-cell">{entry.resourceType}</td>
              <td className="pr-3 text-right text-stone-500">{entry.ms !== undefined ? `${entry.ms} ms` : '…'}</td>
            </tr>;
          })}</tbody>
        </table>}
      </div>
      {current && <RequestDetail entry={current} onClose={() => setSelected(undefined)} />}
    </div>
  </div>;
}

function RequestDetail({ entry, onClose }: { entry: NetworkEntry; onClose: () => void }) {
  const [view, setView] = useState<'response' | 'payload'>(entry.requestBody && !entry.responseBody ? 'payload' : 'response');
  const bad = isFailure(entry);
  return <div className="flex min-w-0 flex-1 flex-col border-l border-white/10">
    <div className="flex shrink-0 items-center gap-3 border-b border-white/[.06] px-3 py-2 font-mono text-[12px]">
      <span className={`rounded px-1.5 py-0.5 text-[10px] ${bad ? 'bg-red-500/20 text-red-200' : 'bg-lime-300/15 text-lime-200'}`}>{entry.status ?? entry.failure ?? 'pending'}</span>
      <span className="min-w-0 truncate text-stone-200">{entry.method} {entry.url}</span>
      <span className="ml-auto shrink-0 text-stone-500">{entry.ms !== undefined ? `${entry.ms} ms` : ''}</span>
      <button onClick={onClose} aria-label="Close request details" className="shrink-0 rounded px-1.5 text-stone-400 hover:bg-white/5 hover:text-white">✕</button>
    </div>
    <div className="flex shrink-0 gap-1 border-b border-white/[.06] px-2 text-[11px]">
      {(['response', 'payload'] as const).map(v => <button key={v} onClick={() => setView(v)} className={`border-b-2 px-2 py-1.5 ${view === v ? 'border-lime-300 text-stone-100' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>{v === 'response' ? 'Response' : 'Payload'}</button>)}
    </div>
    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-5 text-stone-300">{view === 'response' ? (pretty(entry.responseBody) || (entry.resourceType === 'document' ? 'HTML document' : 'No response body recorded.')) : (pretty(entry.requestBody) || 'This request had no body.')}</pre>
  </div>;
}

function Empty({ text }: { text: string }) { return <p className="p-6 text-center font-sans text-sm text-stone-500">{text}</p>; }
