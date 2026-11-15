export type ViewState = 'STILL' | 'WAKING' | 'LIVE';
export default function StateBadge({ state, privateCopy = false }: { state: ViewState; privateCopy?: boolean }) {
  return <span className={`inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 font-mono text-xs tracking-wider ${state === 'LIVE' ? 'border-lime-300/30 bg-lime-300/8 text-lime-200' : 'border-white/15 text-stone-300'}`}><span className={`h-1.5 w-1.5 rounded-full ${state === 'LIVE' ? 'animate-pulse bg-lime-300' : state === 'WAKING' ? 'animate-pulse bg-stone-300' : 'bg-stone-500'}`} />{state}{state === 'LIVE' && privateCopy ? ' · your private copy' : ''}<span className="text-[10px] opacity-45">{state === 'STILL' ? '静止画' : state === 'LIVE' ? '起動中' : '準備中'}</span></span>;
}
export function ModeTag({ mode }: { mode?: string }) {
  if (!mode) return null;
  return <span className="rounded border border-white/20 px-2 py-1 font-mono text-[10px] tracking-[.12em] text-stone-400">{mode === 'local' ? 'LOCAL MODE' : mode === 'mock' ? 'MOCK MODE' : mode === 'rehydrate' ? 'RESTORED STATE' : mode.toUpperCase()}</span>;
}
