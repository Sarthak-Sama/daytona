'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point } from './LiveshotViewer';
import type { ViewState } from './StateBadge';
import type { Copy } from './CopiesPanel';
import { api, sleep } from './client-api';
import type { Investigation } from '@/lib/types';

export type CaptureMetadata = { id: string; mode: string; createdAt: number; note?: string; logsTail?: string; debugState?: unknown; sessions: Copy[]; investigationId?: string; latestInvestigationId?: string };

/** Owns one viewer's private copy of a capture: STILL → WAKING → LIVE, reset, and the latest diagnosis. */
export function useCopySession(captureId: string) {
  const [metadata, setMetadata] = useState<CaptureMetadata>();
  const [state, setState] = useState<ViewState>('STILL');
  const [sessionId, setSessionId] = useState<string>();
  const [error, setError] = useState('');
  const [investigationId, setInvestigationId] = useState<string>();
  const [diagnosis, setDiagnosis] = useState<Investigation>();
  const [inputCount, setInputCount] = useState(0);
  const firstClick = useRef<Point | null>(null); const working = useRef(false); const mounted = useRef(true); const generation = useRef(0);
  const key = `liveshot:${captureId}`;

  const refreshMetadata = useCallback(async () => {
    try { const data = await api<CaptureMetadata>(`/api/captures/${captureId}`); if (!mounted.current) return; setMetadata(data); const latest = data.investigationId || data.latestInvestigationId; if (latest) setInvestigationId(latest); }
    catch (err) { if (mounted.current) setError((err as Error).message); }
  }, [captureId]);

  const waitUntilReady = useCallback(async (id: string, gen: number) => {
    for (let attempt = 0; attempt < 240; attempt++) {
      if (!mounted.current || generation.current !== gen) return;
      const status = await api<{ status: string; error?: string }>(`/api/sessions/${id}`);
      if (status.status === 'ready') { if (mounted.current && generation.current === gen) setSessionId(id); return; }
      if (status.status === 'error' || status.status === 'closed') throw new Error(status.error || 'This copy is no longer available. Wake a new one.');
      await sleep(500);
    }
    throw new Error('This copy is taking too long to wake. Please retry.');
  }, []);

  const wake = useCallback(async (point?: Point) => {
    if (working.current || state === 'LIVE') return;
    working.current = true; const gen = ++generation.current; firstClick.current = point || null; setError(''); setState('WAKING');
    try {
      const { sessionId: id } = await api<{ sessionId: string }>(`/api/captures/${captureId}/sessions`, { method: 'POST', body: '{}' });
      if (generation.current !== gen) return;
      sessionStorage.setItem(key, id); await waitUntilReady(id, gen); void refreshMetadata();
    } catch (err) {
      if (mounted.current && generation.current === gen) { setError((err as Error).message); setState('STILL'); setSessionId(undefined); sessionStorage.removeItem(key); working.current = false; }
    }
  }, [captureId, key, state, waitUntilReady, refreshMetadata]);

  useEffect(() => {
    mounted.current = true; void refreshMetadata(); const interval = setInterval(refreshMetadata, 2000);
    const saved = sessionStorage.getItem(key);
    if (saved) { working.current = true; setState('WAKING'); const gen = ++generation.current; void waitUntilReady(saved, gen).catch(err => { if (mounted.current) { setError((err as Error).message); sessionStorage.removeItem(key); setState('STILL'); working.current = false; } }); }
    return () => { mounted.current = false; generation.current++; clearInterval(interval); };
  }, [key, refreshMetadata, waitUntilReady]);

  const reset = useCallback(async () => {
    generation.current++; const old = sessionId; sessionStorage.removeItem(key); setSessionId(undefined); setState('STILL'); firstClick.current = null; working.current = false;
    if (old) try { await api(`/api/sessions/${old}`, { method: 'DELETE' }); } catch (err) { setError((err as Error).message); }
    void refreshMetadata();
  }, [sessionId, key, refreshMetadata]);

  useEffect(() => {
    if (!investigationId) return; let stopped = false; let timeout: ReturnType<typeof setTimeout>;
    async function poll() { try { const data = await api<Investigation>(`/api/investigations/${investigationId}`); if (stopped) return; setDiagnosis(data); if (data.status === 'starting' || data.status === 'running') timeout = setTimeout(poll, 1500); } catch { if (!stopped) timeout = setTimeout(poll, 3000); } }
    void poll(); return () => { stopped = true; clearTimeout(timeout); };
  }, [investigationId]);

  const onViewerReady = useCallback(() => { setState('LIVE'); working.current = false; }, []);
  const onViewerError = useCallback((message: string) => {
    setError(message);
    if (state === 'WAKING') { generation.current++; sessionStorage.removeItem(key); setSessionId(undefined); setState('STILL'); firstClick.current = null; working.current = false; }
  }, [state, key]);
  const onInputComplete = useCallback(() => setInputCount(n => n + 1), []);

  return { metadata, state, sessionId, error, setError, investigationId, setInvestigationId, diagnosis, inputCount, firstClick, wake, reset, onViewerReady, onViewerError, onInputComplete };
}
