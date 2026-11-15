'use client';
import { useEffect, useState } from 'react';
import { api } from './client-api';
import { describeStep, isFailure, type Recording } from '@/lib/steps';

/** Tells the tester what the capture will carry, and lets them start a clean run. */
export default function RecordingStrip({ sessionId, disabled }: { sessionId?: string; disabled?: boolean }) {
  const [recording, setRecording] = useState<Recording & { available: boolean }>();
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!sessionId) return; let stopped = false;
    const load = () => api<Recording & { available: boolean }>(`/api/sessions/${sessionId}/recording`).then(r => { if (!stopped) setRecording(r); }).catch(() => undefined);
    void load(); const timer = setInterval(load, 1500);
    return () => { stopped = true; clearInterval(timer); };
  }, [sessionId]);
  if (!recording?.available) return null;
  const errors = recording.console.filter(c => c.level === 'error').length;
  const failed = recording.network.filter(isFailure).length;
  async function restart() {
    setResetting(true); setError('');
    try { await api('/api/golden/reset', { method: 'POST', body: '{}' }); } catch (err) { setError((err as Error).message); } finally { setResetting(false); }
  }
  return <div className="mt-4 rounded-lg border border-white/10 bg-white/[.02] p-3">
    <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tracking-wide">
      <span className="flex items-center gap-2 text-red-300"><span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />REC</span>
      <span className="text-stone-300">{recording.steps.length} step{recording.steps.length === 1 ? '' : 's'}</span>
      <span className={errors ? 'text-red-300' : 'text-stone-500'}>{errors} console error{errors === 1 ? '' : 's'}</span>
      <span className={failed ? 'text-red-300' : 'text-stone-500'}>{failed} failed request{failed === 1 ? '' : 's'}</span>
      <button onClick={() => void restart()} disabled={disabled || resetting} className="ml-auto rounded border border-white/15 px-2.5 py-1 font-sans text-xs text-stone-300 transition hover:border-white/30 hover:text-white disabled:opacity-40">{resetting ? 'Resetting…' : 'Start a clean run'}</button>
    </div>
    {recording.steps.length > 0 && <ol className="mt-2 flex flex-wrap gap-1.5">{recording.steps.slice(-6).map(step => <li key={step.n} className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-stone-400"><span className="mr-1 font-mono text-stone-600">{step.n}</span>{describeStep(step)}</li>)}</ol>}
    <p className="mt-2 text-xs text-stone-500">Your clicks, typing, console and network are recorded so a developer can follow your exact steps.</p>
    {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
  </div>;
}
