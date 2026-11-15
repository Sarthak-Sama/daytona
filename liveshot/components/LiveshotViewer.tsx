'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InputEvent } from '@/lib/machine/driver';
import { api } from './client-api';
export type Point = { x: number; y: number };
type Frame = { image: string; mime: string; ts: number };
type Props = { stillUrl?: string; sessionId?: string; interactive: boolean; onFirstClick?: (pt: Point) => void; initialClick?: Point | null; onReady?: () => void; onError?: (message: string) => void; waking?: boolean; onInputComplete?: () => void; bare?: boolean; onStatus?: (status: { busy: boolean; latency?: number }) => void };
const keys: Record<string,string> = { Enter: 'enter', Backspace: 'backspace', Tab: 'tab', Escape: 'escape', Delete: 'delete', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Home: 'home', End: 'end' };
export default function LiveshotViewer({ stillUrl, sessionId, interactive, onFirstClick, initialClick, onReady, onError, waking, onInputComplete, bare = false, onStatus }: Props) {
  const [src, setSrc] = useState(stillUrl || '');
  const [busy, setBusy] = useState(false);
  const [latency, setLatency] = useState<number>();
  const [mobileText, setMobileText] = useState('');
  const [error, setError] = useState('');
  const [ripple, setRipple] = useState<{x:number;y:number;id:number}>();
  const img = useRef<HTMLImageElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const timestamp = useRef(0);
  const generation = useRef(0);
  const buffer = useRef('');
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastScroll = useRef(0);
  const callbacks = useRef({ onReady, onError, onInputComplete }); callbacks.current = { onReady, onError, onInputComplete };
  const initial = useRef(initialClick); initial.current = initialClick;
  const showFrame = useCallback(async (frame: Frame, gen: number) => {
    if (gen !== generation.current || frame.ts < timestamp.current) return;
    const source = `data:${frame.mime};base64,${frame.image}`;
    await new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error('The frame could not load.')); image.src = source; });
    if (gen !== generation.current || frame.ts < timestamp.current) return;
    timestamp.current = frame.ts; setSrc(source);
  }, []);
  const refresh = useCallback(async () => {
    if (!sessionId || pending.current) return;
    const gen = generation.current;
    pending.current++; setBusy(true);
    const start = performance.now();
    try { await showFrame(await api<Frame>(`/api/sessions/${sessionId}/frame`), gen); setLatency(Math.round(performance.now()-start)); }
    catch (err) { if(gen===generation.current) setError((err as Error).message); }
    finally { pending.current--; if(gen===generation.current) setBusy(false); }
  }, [sessionId, showFrame]);
  const send = useCallback((event: InputEvent) => {
    if (!sessionId || !interactive) return;
    const gen = generation.current;
    pending.current++;
    chain.current = chain.current.catch(() => {}).then(async () => {
      if(gen!==generation.current) {pending.current--;return;}
      setBusy(true); const start = performance.now();
      try { const frame = await api<Frame>(`/api/sessions/${sessionId}/input`, { method:'POST', body: JSON.stringify(event) }); await showFrame(frame,gen); setLatency(Math.round(performance.now()-start)); setError(''); callbacks.current.onInputComplete?.(); }
      catch(err) { if(gen===generation.current) { setError((err as Error).message); callbacks.current.onError?.((err as Error).message); } }
      finally {pending.current--;if(gen===generation.current) setBusy(pending.current>0);}
    });
    for(const delay of [700,1500]) timers.current.push(setTimeout(() => {if(gen===generation.current) void refresh();},delay));
  },[sessionId,interactive,showFrame,refresh]);
  const flush = useCallback(() => {if(typingTimer.current) clearTimeout(typingTimer.current); if(buffer.current){const text=buffer.current;buffer.current='';send({type:'type',text});}},[send]);
  useEffect(() => {
    const gen=++generation.current; timestamp.current=0; pending.current=0; chain.current=Promise.resolve(); setError('');
    if(!sessionId) {setSrc(stillUrl || '');return;}
    let cancelled=false;
    (async()=>{setBusy(true);try{await showFrame(await api<Frame>(`/api/sessions/${sessionId}/frame`),gen);if(cancelled)return; callbacks.current.onReady?.();if(initial.current){const point=initial.current;initial.current=null;const frame=await api<Frame>(`/api/sessions/${sessionId}/input`,{method:'POST',body:JSON.stringify({type:'click',...point})});await showFrame(frame,gen);callbacks.current.onInputComplete?.();for(const delay of [700,1500])timers.current.push(setTimeout(()=>{if(gen===generation.current)void refresh();},delay));}box.current?.focus({preventScroll:true});}catch(err){if(!cancelled)callbacks.current.onError?.((err as Error).message);}finally{if(!cancelled)setBusy(false);}})();
    return()=>{cancelled=true;generation.current++;timers.current.forEach(clearTimeout);if(typingTimer.current)clearTimeout(typingTimer.current);buffer.current='';};
  },[sessionId,stillUrl,showFrame,refresh]);
  useEffect(()=>{if(!interactive||!sessionId)return;const interval=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},2000);return()=>clearInterval(interval);},[interactive,sessionId,refresh]);
  const status = useRef(onStatus); status.current = onStatus;
  useEffect(() => { status.current?.({ busy, latency }); }, [busy, latency]);
  // React registers wheel listeners as passive, so preventDefault there cannot stop the page scrolling.
  const wheel = useRef<(event: WheelEvent) => void>(() => {});
  wheel.current = event => {
    if (!interactive || !img.current) return;
    event.preventDefault();
    if (Date.now() - lastScroll.current < 250) return;
    lastScroll.current = Date.now(); flush();
    send({ type: 'scroll', ...point(event.clientX, event.clientY), direction: event.deltaY > 0 ? 'down' : 'up', amount: Math.max(1, Math.min(5, Math.round(Math.abs(event.deltaY) / 80))) });
  };
  useEffect(() => {
    const element = box.current; if (!element) return;
    const listener = (event: WheelEvent) => wheel.current(event);
    element.addEventListener('wheel', listener, { passive: false });
    return () => element.removeEventListener('wheel', listener);
  }, []);
  function point(clientX:number,clientY:number):Point {const image=img.current!;const rect=image.getBoundingClientRect();return {x:Math.round((clientX-rect.left)*(image.naturalWidth/rect.width)),y:Math.round((clientY-rect.top)*(image.naturalHeight/rect.height))};}
  return <div className={bare?'h-full w-full':'mx-auto w-full max-w-[1050px]'}>
    <div className={bare?'relative h-full w-full overflow-hidden':`relative overflow-hidden rounded-sm border bg-[#080909] p-2 shadow-2xl shadow-black/30 transition-colors duration-500 md:p-3 ${interactive?'border-lime-300/35':'border-white/15'}`}>
      <div className={`absolute inset-x-0 top-0 z-10 h-0.5 bg-lime-300 transition-opacity ${busy?'animate-pulse opacity-100':'opacity-0'}`} />
      <div ref={box} tabIndex={0} role="application" aria-label={interactive?'Interactive remote shop. Click the image, then type to control it.':'Captured shop. Click to wake a private copy.'} className={bare?'relative h-full w-full overflow-hidden outline-none':'relative mx-auto aspect-[4/3] w-full max-w-[1024px] overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-lime-200'} onPointerDown={event=>{if(!img.current?.naturalWidth||waking)return; event.preventDefault();box.current?.focus({preventScroll:true});flush();const pt=point(event.clientX,event.clientY);const r=img.current.getBoundingClientRect();setRipple({x:(event.clientX-r.left)/r.width*100,y:(event.clientY-r.top)/r.height*100,id:Date.now()});timers.current.push(setTimeout(()=>setRipple(undefined),500));if(interactive)send({type:'click',...pt,button:event.button===2?'right':'left'});else onFirstClick?.(pt);}} onContextMenu={event=>event.preventDefault()} onKeyDown={event=>{if(!interactive){if(event.key==='Enter'||event.key===' '){event.preventDefault();onFirstClick?.({x:0,y:0});}return;}const modifiers=[event.ctrlKey?'ctrl':'',event.metaKey?'meta':'',event.altKey?'alt':'',event.shiftKey?'shift':''].filter(Boolean);if(keys[event.key]||((event.ctrlKey||event.metaKey||event.altKey)&&event.key.length===1)){event.preventDefault();flush();send({type:'key',key:keys[event.key]||event.key.toLowerCase(),modifiers});}else if(event.key.length===1){event.preventDefault();buffer.current+=event.key;if(typingTimer.current)clearTimeout(typingTimer.current);typingTimer.current=setTimeout(flush,150);}}} >
        {src?<img ref={img} src={src} alt="The captured shop screen" draggable={false} className={`block h-full w-full select-none object-contain transition-opacity duration-150 ${interactive?'cursor-default':'cursor-pointer'}`} />:<div className="flex h-full items-center justify-center font-mono text-xs text-stone-500">Connecting to the machine…</div>}
        {ripple&&<span key={ripple.id} aria-hidden="true" className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border border-lime-300/50 [animation-iteration-count:1]" style={{left:`${ripple.x}%`,top:`${ripple.y}%`}}/>}
      </div>
    </div>
    {!bare&&<><div className="mt-3 flex min-h-5 items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-wider text-stone-500"><span>{waking?'Waking this moment up…':interactive?'Click & type directly on the image':'A captured moment. Click anywhere to continue.'}</span><span>{busy?'WORKING':latency!==undefined?`${latency} ms`:'1024 × 768'}</span></div>
    {error&&<p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}</>}
    {interactive&&<form className="mt-3 hidden gap-2 [@media(pointer:coarse)]:flex" onSubmit={event=>{event.preventDefault();flush();if(mobileText)send({type:'type',text:mobileText});setMobileText('');}}><input aria-label="Text to type in remote shop" value={mobileText} onChange={event=>setMobileText(event.target.value)} placeholder="Type into the shop…" className="min-w-0 flex-1 rounded border border-white/20 bg-white/5 p-3 text-sm outline-none focus:border-lime-300"/><button className="rounded bg-lime-200 px-4 text-sm font-medium text-black">Send</button></form>}
  </div>;
}
