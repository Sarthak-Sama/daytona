export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { apiError } from '@/lib/backend';
import { captureStepThumb } from '@/lib/recording';
export async function GET(_: Request, { params }: { params: Promise<{ id: string; n: string }> }) { try { const { id, n } = await params; return new Response(new Uint8Array(await captureStepThumb(id, Number(n))), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } }); } catch (error) { return apiError(error); } }
