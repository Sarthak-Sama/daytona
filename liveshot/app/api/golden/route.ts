export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { apiError, getGoldenSession } from '@/lib/backend';
import { store } from '@/lib/store';
import { config } from '@/lib/config';
export async function GET() { try { const session = await getGoldenSession(); return Response.json({ sessionId: session.id, locked: store.locked, mode: config.mode }); } catch (error) { return apiError(error); } }
