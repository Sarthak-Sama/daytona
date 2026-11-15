import type { Metadata } from 'next';
import { headers } from 'next/headers';
import ShareExperience from '@/components/ShareExperience';
import { store } from '@/lib/store';

// Shared links unfurl as the bug's screenshot (see opengraph-image.tsx), titled with the tester's note.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:4000';
  const protocol = h.get('x-forwarded-proto') || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  const note = store.captures.get(id)?.note;
  const title = note ? `🐞 ${note}` : '🐞 Bug captured with LIVESHOT';
  const description = 'Open the screenshot and click in: your own live copy, the exact repro steps, console and network.';
  return { metadataBase: new URL(`${protocol}://${host}`), title, description, openGraph: { title, description, type: 'website' }, twitter: { card: 'summary_large_image', title, description } };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <ShareExperience captureId={id} />; }
