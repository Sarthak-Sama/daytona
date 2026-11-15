'use client';
import SiteHeader from './SiteHeader';
import LiveshotViewer from './LiveshotViewer';
import StateBadge from './StateBadge';
import CopiesPanel from './CopiesPanel';
import InvestigationPanel from './InvestigationPanel';
import XrayPanel from './XrayPanel';
import BugRoom from './BugRoom';
import { useCopySession } from './useCopySession';

export default function ShareExperience({ captureId, split = false }: { captureId: string; split?: boolean }) {
  if (!split) return <BugRoom captureId={captureId} />;
  return <SplitView captureId={captureId} />;
}

function SplitView({ captureId }: { captureId: string }) {
  const copy = useCopySession(captureId);
  const { metadata, state, sessionId, error } = copy;
  const stillUrl = `/api/captures/${captureId}/still`;
  return <><SiteHeader mode={metadata?.mode} /><main className="mx-auto max-w-[1800px] px-5 pb-12 pt-8 md:px-10 md:pt-10">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-3 font-mono text-[10px] tracking-[.22em] text-stone-500">03 / SIDE BY SIDE<span className="ml-4 text-stone-600">{captureId}</span></p><h1 className="text-3xl font-medium tracking-tight md:text-4xl">One moment. Different futures.</h1><p className="mt-3 text-sm leading-6 text-stone-400">{state === 'LIVE' ? 'Everything you do here stays in your private copy.' : state === 'WAKING' ? 'Preparing your own copy. Your first click will follow you in.' : 'Click inside the image to continue from this moment.'}</p></div><StateBadge state={state} privateCopy /></div>
    <div className="grid items-start gap-8 2xl:grid-cols-[minmax(0,1fr)_340px]"><section className="min-w-0"><div className="grid gap-6 lg:grid-cols-2"><div><p className="mb-3 font-mono text-[10px] tracking-[.18em] text-stone-500">ORIGINAL / UNTOUCHED</p><div className="rounded-sm border border-white/15 bg-[#080909] p-2 md:p-3"><img src={stillUrl} alt="Original untouched captured shop" className="aspect-[4/3] w-full object-contain" /></div></div><div><p className="mb-3 font-mono text-[10px] tracking-[.18em] text-lime-200/70">YOUR COPY / CONTINUE HERE</p><LiveshotViewer stillUrl={stillUrl} sessionId={sessionId} interactive={state === 'LIVE'} waking={state === 'WAKING'} initialClick={copy.firstClick.current} onFirstClick={point => void copy.wake(point)} onReady={copy.onViewerReady} onError={copy.onViewerError} onInputComplete={copy.onInputComplete} /></div></div>
      <div className="mt-5 flex flex-wrap items-center gap-3">{state === 'STILL' && <button onClick={() => void copy.wake()} className="min-h-11 rounded bg-lime-200 px-5 py-3 text-sm font-semibold text-black transition hover:bg-lime-100">{error ? 'Retry · Wake my copy' : 'Interact with this moment'} <span className="ml-3">↗</span></button>}{state === 'WAKING' && <span role="status" className="font-mono text-xs text-stone-400">Waking this moment up…</span>}{state === 'LIVE' && <button onClick={() => void copy.reset()} className="min-h-11 rounded border border-white/15 px-4 py-2 text-sm text-stone-400 transition hover:border-white/30 hover:text-white">Reset my copy</button>}<a href={`/s/${captureId}`} className="ml-auto min-h-11 py-3 text-sm text-stone-400 transition hover:text-lime-200">← Bug room</a></div>
      {error && <p role="alert" className="mt-4 rounded border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-200">{error}</p>}</section>
      <aside className="min-w-0 space-y-7">{state === 'LIVE' && sessionId && <XrayPanel sessionId={sessionId} refreshKey={copy.inputCount} live />}<CopiesPanel captureId={captureId} sessions={metadata?.sessions || []} /><InvestigationPanel captureId={captureId} investigationId={copy.investigationId} onInvestigation={copy.setInvestigationId} /></aside></div>
  </main></>;
}
