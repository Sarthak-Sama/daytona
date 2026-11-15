export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { apiError, sessionFrame } from '@/lib/backend';
import type { RouteContext } from '@/lib/api';
export async function GET(_: Request, { params }: RouteContext) { try { return Response.json(await sessionFrame((await params).id), { headers: { 'Cache-Control': 'no-store' } }); } catch(error) { return apiError(error); } }
