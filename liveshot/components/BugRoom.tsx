'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LiveshotViewer, { NavBar, type ViewerControls } from './LiveshotViewer';
import { ModeTag } from './StateBadge';
import DevtoolsDock, { type DockTab } from './DevtoolsDock';
import InvestigationPanel from './InvestigationPanel';
import XrayPanel from './XrayPanel';
import { useCopySession } from './useCopySession';
import { api } from './client-api';
import { bugStep, describeStep, isFailure, markdownReport, playwrightTest, relativeTime, stepSignals, type RecordedStep, type Recording } from '@/lib/steps';

type PublicRecording = Recording & { available: boolean; capturedAt?: number };
const W = 1024, H = 768;
const CAPTURED = undefined;

export default function BugRoom({ captureId }: { captureId: string }) {
  const copy = useCopySession(captureId);
  const { metadata, state, sessionId, diagnosis } = copy;
  const [recording, setRecording] = useState<PublicRecording>();
  const [live, setLive] = useState<PublicRecording>();
  const [source, setSource] = useState<'tester' | 'live'>('tester');
  const [selected, setSelected] = useState<number | undefined>(CAPTURED);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<DockTab>('console');
  const [expanded, setExpanded] = useState(true);
  const [toast, setToast] = useState('');
  const [status, setStatus] = useState<{ busy: boolean; latency?: number }>({ busy: false });
  const [menu, setMenu] = useState(false);
  const switchedToLive = useRef(false);
  const controls = useRef<ViewerControls | null>(null);
  const stillUrl = `/api/captures/${captureId}/still`;
  const steps = useMemo(() => recording?.steps ?? [], [recording]);
  const signals = useMemo(() => recording ? stepSignals(recording) : new Map(), [recording]);
  const firstBug = useMemo(() => recording ? bugStep(recording) : undefined, [recording]);
  const title = metadata?.note || 'Untitled bug';

  useEffect(() => { let active = true; api<PublicRecording>(`/api/captures/${captureId}/recording`).then(r => { if (!active) return; setRecording(r); for (const s of r.steps) if (s.hasThumb) new Image().src = `/api/captures/${captureId}/steps/${s.n}`; if (r.initialThumb) new Image().src = `/api/captures/${captureId}/steps/0`; }).catch(() => undefined); return () => { active = false; }; }, [captureId]);

  // Your copy records its own console and network from the moment it wakes.
  useEffect(() => {
    if (state !== 'LIVE' || !sessionId) { setLive(undefined); return; }
    let stopped = false;
    const load = () => api<PublicRecording>(`/api/sessions/${sessionId}/recording`).then(r => { if (!stopped) setLive(r); }).catch(() => undefined);
    void load(); const timer = setInterval(load, 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [state, sessionId, copy.inputCount]);
  useEffect(() => { if (copy.inputCount > 0 && !switchedToLive.current) { switchedToLive.current = true; setSource('live'); } }, [copy.inputCount]);
  useEffect(() => { if (state !== 'LIVE') { switchedToLive.current = false; setSource('tester'); } }, [state]);

  // Replay: walk the steps, then land on the captured moment.
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      setSelected(current => {
        const next = current === CAPTURED ? steps[0]?.n : steps[steps.findIndex(s => s.n === current) + 1]?.n;
        if (next === undefined) setPlaying(false);
        return next;
      });
    }, selected === CAPTURED ? 250 : 1500);
    return () => clearTimeout(timer);
  }, [playing, selected, steps]);

  const go = useCallback((delta: number) => {
    setPlaying(false);
    setSelected(current => {
      const index = current === CAPTURED ? steps.length : steps.findIndex(s => s.n === current);
      const next = Math.max(0, Math.min(steps.length, index + delta));
      return next === steps.length ? CAPTURED : steps[next].n;
    });
  }, [steps]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || target.closest('input,textarea,[role="application"]')) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
      if (event.key === ' ' && steps.length) { event.preventDefault(); setPlaying(p => !p); }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [go, steps.length]);

  function selectStep(n: number | undefined) { setPlaying(false); setSelected(n === 0 ? steps[0]?.n : n); }
  function flash(text: string) { setToast(text); setTimeout(() => setToast(t => t === text ? '' : t), 2400); }
  async function copyText(text: string, done: string) { try { await navigator.clipboard.writeText(text); flash(done); } catch { flash('Copy failed. Your browser blocked the clipboard.'); } setMenu(false); }
  const link = typeof location !== 'undefined' ? `${location.origin}/s/${captureId}` : `/s/${captureId}`;
  const shown = source === 'live' && live ? live : recording;
  const errors = recording?.console.filter(c => c.level === 'error').length ?? 0;
  const failures = recording?.network.filter(isFailure) ?? [];
  const running = diagnosis && (diagnosis.status === 'starting' || diagnosis.status === 'running');

  return <div className="flex min-h-dvh flex-col bg-[#0a0b0b] lg:h-dvh lg:min-h-0">
    {/* Header */}
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 px-4 py-2.5">
      <a href="/" aria-label="LIVESHOT home" className="flex h-7 w-7 shrink-0 items-center justify-center border border-lime-200/70 text-[11px] font-semibold text-lime-200">L</a>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-medium text-stone-100">{title}</h1>
        <p className="truncate font-mono text-[10px] tracking-wider text-stone-500">CAPTURED {metadata ? new Date(metadata.createdAt).toLocaleString() : '…'} · {steps.length} STEPS{errors ? <span className="text-red-300"> · {errors} CONSOLE ERROR{errors > 1 ? 'S' : ''}</span> : null}{failures.length ? <span className="text-red-300"> · {failures.length} FAILED REQUEST{failures.length > 1 ? 'S' : ''}</span> : null}</p>
      </div>
      <ConnectionPill state={state} status={status} />
      <ModeTag mode={metadata?.mode} />
      <div className="flex items-center gap-2">
        <button onClick={() => void copyText(link, 'Link copied. Anyone who opens it gets their own copy.')} className="h-8 rounded-md border border-white/15 px-3 text-xs text-stone-200 hover:border-white/30">Copy link</button>
        <div className="relative">
          <button onClick={() => setMenu(m => !m)} aria-expanded={menu} className="h-8 rounded-md bg-lime-200 px-3 text-xs font-semibold text-black hover:bg-lime-100">Export ▾</button>
          {menu && <div role="menu" className="absolute right-0 top-10 z-50 w-72 overflow-hidden rounded-lg border border-white/15 bg-[#161818] shadow-2xl">
            <MenuItem title="Copy as issue (Markdown)" hint="Steps, failed requests, console errors and this link" disabled={!recording?.available} onClick={() => recording && void copyText(markdownReport(recording, { title, link, capturedAt: recording.capturedAt }), 'Issue Markdown copied.')} />
            <MenuItem title="Copy Playwright test" hint="Replays the steps and fails where the bug appears" disabled={!recording?.available} onClick={() => recording && void copyText(playwrightTest(recording, { title: `LIVESHOT ${captureId}: ${title}` }), 'Playwright test copied.')} />
            <MenuItem title="Download .spec.ts" hint="Same test, as a file" disabled={!recording?.available} onClick={() => { if (!recording) return; const blob = new Blob([playwrightTest(recording, { title: `LIVESHOT ${captureId}: ${title}` })], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `liveshot-${captureId}.spec.ts`; a.click(); URL.revokeObjectURL(a.href); setMenu(false); }} />
            <a href={`/s/${captureId}/split`} className="block border-t border-white/10 px-4 py-2.5 text-xs text-stone-400 hover:bg-white/5 hover:text-stone-200">Compare side by side ↗</a>
          </div>}
        </div>
      </div>
    </header>

    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Steps rail */}
      <aside aria-label="Steps to reproduce" className="order-2 flex shrink-0 flex-col border-white/10 lg:order-1 lg:w-[310px] lg:border-r">
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
          <h2 className="font-mono text-[11px] tracking-[.18em] text-stone-400">STEPS TO REPRODUCE</h2>
          {steps.length > 0 && <button onClick={() => { if (!playing && selected !== CAPTURED && selected === steps.at(-1)?.n) setSelected(CAPTURED); setPlaying(p => !p); }} className="flex h-7 items-center gap-1.5 rounded-full border border-white/15 px-3 text-[11px] text-stone-200 hover:border-lime-200/50 hover:text-lime-100">{playing ? '❚❚ Pause' : '▶ Replay'}</button>}
        </div>
        {firstBug !== undefined && <button onClick={() => { selectStep(firstBug); const failed = signals.get(firstBug)?.failures.length; setTab(failed ? 'network' : 'console'); setExpanded(true); }} className="mx-3 mb-2 rounded-lg border border-red-400/25 bg-red-500/[.07] p-3 text-left transition hover:bg-red-500/10">
          <p className="font-mono text-[10px] tracking-wider text-red-300">BUG SURFACED AT STEP {firstBug}</p>
          <p className="mt-1 text-[13px] text-stone-200">{steps.find(s => s.n === firstBug) && describeStep(steps.find(s => s.n === firstBug)!)}</p>
          {signals.get(firstBug)?.failures[0] && <p className="mt-1 truncate font-mono text-[11px] text-red-200">{signals.get(firstBug)!.failures[0].method} {signals.get(firstBug)!.failures[0].url} → {signals.get(firstBug)!.failures[0].status ?? 'failed'}</p>}
        </button>}
        <ol className="min-h-0 flex-1 overflow-auto px-2 pb-3 max-lg:max-h-[50vh]">
          {!recording ? <li className="px-3 py-4 text-sm text-stone-500">Loading steps…</li> : !recording.available ? <li className="px-3 py-4 text-sm leading-6 text-stone-500">This capture has no step recording. Steps are recorded in local mode.</li> : !steps.length ? <li className="px-3 py-4 text-sm text-stone-500">The tester captured without interacting.</li> : null}
          {steps.map(step => <StepRow key={step.n} step={step} start={recording!.startedAt} active={selected === step.n} bug={step.n === firstBug} signal={signals.get(step.n)} onClick={() => selectStep(step.n)} />)}
          {recording && <li><button onClick={() => selectStep(CAPTURED)} className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition ${selected === CAPTURED ? 'bg-lime-300/10 ring-1 ring-lime-300/30' : 'hover:bg-white/[.04]'}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${state === 'LIVE' ? 'bg-lime-300 text-black' : 'bg-stone-200 text-black'}`}>{state === 'LIVE' ? '●' : '◎'}</span>
            <span className="min-w-0"><span className="block text-[13px] text-stone-100">{state === 'LIVE' ? 'Your live copy' : 'Captured moment'}</span><span className="block font-mono text-[10px] text-stone-500">{state === 'LIVE' ? 'Continue from here' : 'Click the screen to take control'}</span></span>
          </button></li>}
        </ol>
        {metadata?.note && <p className="hidden border-t border-white/10 px-4 py-3 text-[13px] leading-5 text-stone-400 lg:block">“{metadata.note}”<span className="mt-1 block font-mono text-[10px] text-stone-600">TESTER’S NOTE</span></p>}
      </aside>

      {/* Stage + dock */}
      <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col lg:order-2">
        <div className="relative h-[78vw] shrink-0 bg-[radial-gradient(ellipse_at_center,#1a1d1c_0%,#0a0b0b_70%)] p-3 md:p-6 lg:h-auto lg:min-h-0 lg:flex-1">
          <div className="grid h-full w-full place-items-center" style={{ containerType: 'size' }}>
            <div className="flex flex-col gap-2" style={{ width: 'min(100cqw, calc((100cqh - 44px) * 4 / 3))' }}>
            <NavBar disabled={state !== 'LIVE' || selected !== CAPTURED} onNav={action => controls.current?.nav(action)}><span className="ml-2 min-w-0 flex-1 truncate rounded bg-black/30 px-3 py-1 font-mono text-[11px] text-stone-500">{state === 'LIVE' ? 'Your private copy · live' : state === 'WAKING' ? 'Connecting…' : 'Captured moment · click the screen to take control'}</span></NavBar>
            <div className="relative" style={{ aspectRatio: '4 / 3' }}>
              <div className={`absolute inset-0 overflow-hidden rounded-lg bg-[#080909] shadow-[0_40px_120px_-30px_rgba(0,0,0,.9)] ring-1 transition-all duration-700 ${state === 'LIVE' ? 'ring-lime-300/50 shadow-lime-300/5' : state === 'WAKING' ? 'ring-lime-200/30' : 'ring-white/15'}`}>
                <LiveshotViewer bare stillUrl={stillUrl} sessionId={sessionId} interactive={state === 'LIVE'} waking={state === 'WAKING'} initialClick={copy.firstClick.current} onFirstClick={point => { setSelected(CAPTURED); void copy.wake(point); }} onReady={copy.onViewerReady} onError={copy.onViewerError} onInputComplete={copy.onInputComplete} onStatus={setStatus} controls={controls} />
                {state === 'STILL' && selected === CAPTURED && <TakeControlHint />}
                {state === 'WAKING' && <WakingOverlay />}
                {selected !== CAPTURED && <Replay captureId={captureId} steps={steps} n={selected} initialThumb={!!recording?.initialThumb} onExit={() => selectStep(CAPTURED)} live={state === 'LIVE'} />}
              </div>
            </div>
            </div>
          </div>
          {copy.error && <p role="alert" className="absolute inset-x-4 bottom-3 mx-auto max-w-xl rounded-lg border border-red-300/20 bg-[#1c1111]/95 px-4 py-2.5 text-center text-sm text-red-200">{copy.error}{state === 'STILL' && <button onClick={() => void copy.wake()} className="ml-3 underline">Retry</button>}</p>}
        </div>
        <div className={`${expanded ? 'h-[42vh] lg:h-[36vh]' : 'h-10'} flex shrink-0 flex-col`}>
          <DevtoolsDock recording={shown} source={source === 'live' && live ? 'live' : 'tester'} onSource={setSource} liveAvailable={!!live} selectedStep={source === 'tester' ? selected : undefined} onSelectStep={n => { setSource('tester'); selectStep(n); }} tab={tab} onTab={setTab} expanded={expanded} onToggle={() => setExpanded(e => !e)}
            detectiveBadge={running ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-300" /> : diagnosis?.status === 'done' ? <span className="text-[10px] text-lime-300">✓</span> : null}
            server={state === 'LIVE' && sessionId ? <div className="max-w-3xl"><XrayPanel sessionId={sessionId} refreshKey={copy.inputCount} live /></div> : <CapturedServer logs={metadata?.logsTail} state={metadata?.debugState} />}
            detective={<div className="max-w-3xl"><InvestigationPanel captureId={captureId} investigationId={copy.investigationId} onInvestigation={copy.setInvestigationId} /></div>} />
        </div>
      </div>
    </div>
    {toast && <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/15 bg-[#1b1d1d] px-4 py-2 text-sm text-stone-100 shadow-2xl">{toast}</div>}
  </div>;
}

function ConnectionPill({ state, status }: { state: string; status: { busy: boolean; latency?: number } }) {
  const label = state === 'LIVE' ? `LIVE · ${status.busy ? 'working' : status.latency !== undefined ? `${status.latency} ms` : 'connected'}` : state === 'WAKING' ? 'CONNECTING' : 'SCREENSHOT';
  return <span className={`inline-flex h-7 items-center gap-2 rounded-full border px-3 font-mono text-[10px] tracking-wider ${state === 'LIVE' ? 'border-lime-300/30 bg-lime-300/[.06] text-lime-200' : 'border-white/15 text-stone-400'}`}><span className={`h-1.5 w-1.5 rounded-full ${state === 'LIVE' ? 'animate-pulse bg-lime-300' : state === 'WAKING' ? 'animate-pulse bg-stone-300' : 'bg-stone-500'}`} />{label}</span>;
}

function MenuItem({ title, hint, onClick, disabled }: { title: string; hint: string; onClick: () => void; disabled?: boolean }) {
  return <button role="menuitem" disabled={disabled} onClick={onClick} className="block w-full px-4 py-2.5 text-left hover:bg-white/5 disabled:opacity-40"><span className="block text-xs text-stone-100">{title}</span><span className="block text-[11px] text-stone-500">{hint}</span></button>;
}

function StepRow({ step, start, active, bug, signal, onClick }: { step: RecordedStep; start: number; active: boolean; bug: boolean; signal?: { errors: number; failures: { status?: number; failure?: string }[] }; onClick: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { if (active) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [active]);
  return <li ref={ref}><button onClick={onClick} className={`group flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition ${active ? 'bg-lime-300/10 ring-1 ring-lime-300/30' : 'hover:bg-white/[.04]'}`}>
    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] ${bug ? 'bg-red-400 text-black' : active ? 'bg-lime-300 text-black' : 'bg-white/10 text-stone-300'}`}>{step.n}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-[13px] leading-5 text-stone-100">{describeStep(step)}</span>
      <span className="flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-stone-500"><span>{relativeTime(step.t, start)}</span>{step.target?.testId && <span className="truncate text-stone-600">[{step.target.testId}]</span>}</span>
      {(signal?.failures.length || signal?.errors) ? <span className="mt-1 flex flex-wrap gap-1.5">{signal.failures.map((f, i) => <span key={i} className="rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[10px] text-red-200">{f.status ?? f.failure}</span>)}{signal.errors ? <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[10px] text-red-200">✕ {signal.errors} error{signal.errors > 1 ? 's' : ''}</span> : null}</span> : null}
    </span>
  </button></li>;
}

/** The screen the tester saw right before the step, with a cursor that travels to where they acted. */
function Replay({ captureId, steps, n, initialThumb, onExit, live }: { captureId: string; steps: RecordedStep[]; n?: number; initialThumb: boolean; onExit: () => void; live: boolean }) {
  const index = steps.findIndex(s => s.n === n); const step = steps[index];
  const previous = steps.slice(0, index).reverse().find(s => s.hasThumb);
  const image = previous ? `/api/captures/${captureId}/steps/${previous.n}` : initialThumb ? `/api/captures/${captureId}/steps/0` : step?.hasThumb ? `/api/captures/${captureId}/steps/${step.n}` : undefined;
  const point = useMemo(() => { for (let i = index; i >= 0; i--) { const s = steps[i]; if (s?.x !== undefined && s.y !== undefined) return { x: s.x, y: s.y }; } return { x: W / 2, y: H / 2 }; }, [index, steps]);
  if (!step) return null;
  return <div className="absolute inset-0 z-20 bg-[#080909]">
    {image ? <img src={image} alt={`Screen before step ${step.n}`} draggable={false} className="h-full w-full select-none object-contain" /> : <div className="grid h-full place-items-center text-sm text-stone-500">No screenshot for this step.</div>}
    <div className="pointer-events-none absolute inset-0 bg-black/10" />
    {/* Persistent cursor: its position transitions between steps. */}
    <div className="pointer-events-none absolute z-10 transition-[left,top] duration-700 ease-[cubic-bezier(.2,.8,.2,1)]" style={{ left: `${point.x / W * 100}%`, top: `${point.y / H * 100}%` }}>
      {step.action === 'click' && <span key={step.n} className="absolute -left-5 -top-5 h-10 w-10 rounded-full border-2 border-lime-300 opacity-0 [animation:liveshot-click_.9s_.55s_ease-out_1]" />}
      <svg width="22" height="22" viewBox="0 0 24 24" className="-ml-[3px] -mt-[2px] drop-shadow-[0_2px_6px_rgba(0,0,0,.6)]"><path d="M4 2l16 9.5-7 1.6 4.2 7.4-2.6 1.5-4.2-7.4L5 19.6z" fill="#f5f5f4" stroke="#0a0a0a" strokeWidth="1.4" strokeLinejoin="round" /></svg>
      {step.action === 'type' && <span className="absolute left-5 top-5 whitespace-nowrap rounded-md bg-lime-200 px-2 py-1 font-mono text-xs text-black shadow-lg">⌨ {step.text}</span>}
      {step.action === 'key' && <span className="absolute left-5 top-5 whitespace-nowrap rounded-md border border-white/30 bg-[#1b1d1d] px-2 py-1 font-mono text-xs text-stone-100 shadow-lg">{step.key}</span>}
    </div>
    <div className="absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-3">
      <span className="rounded bg-lime-300 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-black">REPLAY {step.n}/{steps.length}</span>
      <span className="min-w-0 truncate text-sm text-white">{describeStep(step)}</span>
      <button onClick={onExit} className="pointer-events-auto ml-auto shrink-0 rounded-full border border-white/25 bg-black/40 px-3 py-1 text-[11px] text-stone-100 hover:bg-black/60">{live ? 'Back to your copy' : 'Back to captured moment'} ⏎</button>
    </div>
  </div>;
}

function TakeControlHint() {
  return <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-3">
    <span className="flex items-center gap-2.5 rounded-full bg-lime-200 px-3.5 py-1.5 text-xs font-semibold text-black shadow-[0_10px_40px_-5px_rgba(190,242,100,.45)] [animation:liveshot-bob_2.4s_ease-in-out_infinite]"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-black/50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-black" /></span>Click anywhere to take control</span>
  </div>;
}

function WakingOverlay() {
  const lines = ['Restoring server state…', 'Starting a private browser…', 'Reopening the captured screen…'];
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(n => Math.min(n + 1, lines.length - 1)), 1400); return () => clearInterval(t); }, [lines.length]);
  return <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden bg-black/35 backdrop-grayscale-[.6]">
    <div className="absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-lime-300/15 to-transparent [animation:liveshot-scan_1.6s_linear_infinite]" />
    <div className="absolute inset-0 grid place-items-center"><span className="rounded-full border border-lime-200/30 bg-black/70 px-4 py-2 font-mono text-xs tracking-wide text-lime-100">{lines[i]}</span></div>
  </div>;
}

function CapturedServer({ logs, state }: { logs?: string; state?: unknown }) {
  return <div className="grid gap-4 lg:grid-cols-2">
    <section><h3 className="mb-2 font-mono text-[11px] tracking-[.14em] text-stone-400">SERVER STATE AT THE CAPTURED MOMENT</h3><pre className="max-h-[28vh] overflow-auto rounded border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-5 text-stone-300">{state ? JSON.stringify(state, null, 2) : 'Not recorded.'}</pre></section>
    <section><h3 className="mb-2 font-mono text-[11px] tracking-[.14em] text-stone-400">SERVER LOGS</h3><pre className="max-h-[28vh] overflow-auto whitespace-pre-wrap break-all rounded border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-5 text-stone-400">{logs || 'No logs were recorded.'}</pre><p className="mt-2 text-xs text-stone-500">Take control of the screenshot to see what the server does next.</p></section>
  </div>;
}
