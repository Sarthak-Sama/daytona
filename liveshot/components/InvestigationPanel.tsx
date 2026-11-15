'use client';
import { useEffect, useRef, useState } from 'react';
import type { AgentStep, Investigation } from '@/lib/types';
import ReportCard from './ReportCard';

const fmt = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };

function Step({ step, open, highlight, onToggle }: { step: AgentStep; open: boolean; highlight: boolean; onToggle: () => void }) {
  if (step.kind !== 'command') return <li id={`agent-step-${step.n}`} className="px-3 py-2 text-xs italic leading-relaxed text-stone-500">{step.text}</li>;
  const failed = !!step.exitCode;
  return (
    <li id={`agent-step-${step.n}`} className={`scroll-mt-8 transition-colors ${highlight ? 'bg-lime-200/10' : ''}`}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-white/[.03] focus-visible:outline-2 focus-visible:outline-lime-200">
        <span className="mt-0.5 w-5 shrink-0 font-mono text-[10px] text-stone-500">{String(step.n).padStart(2, '0')}</span>
        <code className={`min-w-0 flex-1 font-mono text-xs text-lime-200 ${open ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>$ {step.command}</code>
        <span className={`mt-0.5 shrink-0 font-mono text-[10px] ${failed ? 'text-red-300' : 'text-stone-500'}`}>{failed ? `exit ${step.exitCode}` : `${step.ms} ms`}</span>
        <span className="mt-0.5 shrink-0 text-[10px] text-stone-500" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && <pre className="mx-3 mb-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-stone-400">{step.output?.trim() || '(no output)'}</pre>}
    </li>
  );
}

export default function InvestigationPanel({ captureId, investigationId, onInvestigation }: { captureId: string; investigationId?: string | null; onInvestigation?: (id: string) => void }) {
  const [id, setId] = useState(investigationId || '');
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [openSteps, setOpenSteps] = useState<Set<number>>(new Set());
  const [showLog, setShowLog] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => { if (investigationId) setId(investigationId); }, [investigationId]);
  useEffect(() => {
    if (!id) return; let stopped = false; let timeout: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/investigations/${id}`, { cache: 'no-store' }); const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load investigation.');
        if (!stopped) { setInvestigation(data); setError(''); if (data.status === 'starting' || data.status === 'running') timeout = setTimeout(poll, 600); }
      } catch (e) { if (!stopped) { setError(e instanceof Error ? e.message : 'Could not load investigation.'); timeout = setTimeout(poll, 2000); } }
    }
    void poll(); return () => { stopped = true; clearTimeout(timeout); };
  }, [id]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const status = investigation?.status;
  const busy = pending || status === 'starting' || status === 'running';
  const steps = investigation?.steps || [];
  const commands = steps.filter(s => s.kind === 'command');
  useEffect(() => { if (!busy) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [busy]);
  useEffect(() => { if (busy && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [busy, steps.length]);

  async function start() {
    setPending(true); setError(''); setInvestigation(null); setOpenSteps(new Set()); setShowLog(false);
    try {
      const response = await fetch(`/api/captures/${captureId}/investigate`, { method: 'POST' }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start Detective.');
      setId(data.investigationId); onInvestigation?.(data.investigationId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start Detective.'); } finally { setPending(false); }
  }
  function evidence(n: number) {
    setShowLog(true); setOpenSteps(prev => new Set(prev).add(n)); setHighlight(n);
    setTimeout(() => document.getElementById(`agent-step-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setHighlight(null), 2500);
  }
  const toggle = (n: number) => setOpenSteps(prev => { const next = new Set(prev); if (next.has(n)) next.delete(n); else next.add(n); return next; });

  const elapsed = investigation?.startedAt ? fmt((investigation.finishedAt || now) - investigation.startedAt) : '';
  const phase = pending || status === 'starting' ? 'Forking a private copy of the machine…' : commands.length ? `Running command ${commands.length}…` : 'Reading the captured state…';
  const logVisible = busy || showLog || status === 'error';
  const pill = busy ? 'border-lime-200/40 bg-lime-200/10 text-lime-200' : status === 'done' ? 'border-lime-200/40 bg-lime-200/10 text-lime-200' : status === 'error' ? 'border-red-300/40 bg-red-300/10 text-red-200' : 'border-white/15 text-stone-400';

  return (
    <section id="investigation-panel" className="scroll-mt-8 rounded-xl border border-white/10 bg-white/[.02] p-5" aria-label="AI Detective">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-medium text-stone-100">AI Detective</h2>
        <span role="status" className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${pill}`}>
          {busy && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-200" />}
          {busy ? 'Investigating' : status === 'done' ? 'Solved' : status === 'error' ? 'Failed' : 'Private copy'}
          {elapsed && <span className="text-stone-400">· {elapsed}</span>}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-stone-400">
        {investigation ? `Working in its own copy of the machine · ${investigation.model} on ${investigation.provider}` : 'An investigator gets its own copy of the machine, reproduces the bug and reports the root cause. Every finding links to a command it ran.'}
      </p>
      {investigation?.provider === 'STUB' && <p className="mt-3 rounded border border-amber-200/25 bg-amber-200/5 px-3 py-2 text-xs text-amber-100"><strong>STUB</strong> · No model was used. Execution plumbing only; never use this in the demo.</p>}

      {busy ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-lime-200/20 bg-lime-200/[.04]">
          <div className="flex items-center gap-3 px-4 py-3 text-sm text-stone-200">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-lime-200/30 border-t-lime-200" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{phase}</span>
          </div>
          <div className="h-0.5 w-full overflow-hidden bg-white/5"><div className="h-full w-1/3 animate-pulse bg-lime-200/70" /></div>
        </div>
      ) : (
        <button onClick={start} className={`mt-4 min-h-11 w-full rounded-lg px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-lime-200 ${investigation ? 'border border-white/20 text-stone-100 hover:bg-white/5' : 'bg-lime-200 text-stone-950 hover:bg-lime-100'}`}>
          {investigation ? 'Run another investigation' : 'Ask AI Detective'}
        </button>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
      {investigation?.error && <p role="alert" className="mt-3 rounded border border-red-300/25 bg-red-300/5 px-3 py-2 text-sm text-red-200">{investigation.error}</p>}
      {investigation?.report && <ReportCard report={investigation.report} onEvidence={evidence} />}

      {steps.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-white/8 bg-black/20">
          <button onClick={() => setShowLog(v => !v)} disabled={busy} aria-expanded={logVisible} className="flex w-full items-center justify-between px-3 py-2.5 font-mono text-[10px] uppercase tracking-wider text-stone-400 hover:text-stone-200 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-lime-200">
            <span>What it ran · {commands.length} command{commands.length === 1 ? '' : 's'}</span>
            {!busy && <span aria-hidden>{logVisible ? 'Hide ▾' : 'Show ▸'}</span>}
          </button>
          {logVisible && <ol ref={logRef} className="max-h-[420px] divide-y divide-white/5 overflow-auto border-t border-white/8" aria-label="Command transcript">
            {steps.map(step => <Step key={step.n} step={step} open={openSteps.has(step.n)} highlight={highlight === step.n} onToggle={() => toggle(step.n)} />)}
          </ol>}
        </div>
      )}
    </section>
  );
}
