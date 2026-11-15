export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { apiError, createSession } from '@/lib/backend';
import type { RouteContext } from '@/lib/api';
export async function POST(_: Request, { params }: RouteContext) { try { const session = await createSession((await params).id, 'human'); return Response.json({ sessionId: session.id }); } catch(error) { return apiError(error); } }
