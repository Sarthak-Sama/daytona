export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { apiError } from '@/lib/backend';
import { resetGoldenRecording } from '@/lib/recording';
export async function POST() { try { await resetGoldenRecording(); return Response.json({ ok: true }); } catch (error) { return apiError(error); } }
