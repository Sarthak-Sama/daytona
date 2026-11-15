import fs from 'node:fs/promises';
import { ImageResponse } from 'next/og';
import { store } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'The captured bug screenshot. Click to take control.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const capture = store.captures.get((await params).id);
  let still = '';
  if (capture && /\.(png|jpe?g)$/.test(capture.stillPath)) {
    try { still = `data:image/${capture.stillPath.endsWith('.png') ? 'png' : 'jpeg'};base64,${(await fs.readFile(capture.stillPath)).toString('base64')}`; } catch { /* fall back to the plain card */ }
  }
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0b0b', position: 'relative' }}>
      {still ? <img src={still} width={680} height={510} style={{ borderRadius: 14, border: '2px solid rgba(190,242,100,.55)', boxShadow: '0 30px 80px rgba(0,0,0,.6)' }} /> : <div style={{ color: '#e7e5e4', fontSize: 48 }}>LIVESHOT</div>}
      <div style={{ position: 'absolute', bottom: 46, display: 'flex', alignItems: 'center', gap: 14, background: '#d9f99d', color: '#0a0a0a', padding: '14px 26px', borderRadius: 999, fontSize: 30, fontWeight: 700 }}>
        <div style={{ width: 14, height: 14, borderRadius: 999, background: '#0a0a0a' }} />
        Click to take control
      </div>
      <div style={{ position: 'absolute', top: 28, left: 34, display: 'flex', color: '#a8a29e', fontSize: 22, letterSpacing: 4 }}>LIVESHOT · LIVE BUG</div>
    </div>,
    size,
  );
}
