export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { apiError } from '@/lib/backend';
import { sessionXray } from '@/lib/xray';
import type { RouteContext } from '@/lib/api';
export async function GET(_: Request, { params }: RouteContext) { try { return Response.json(await sessionXray((await params).id), { headers: { 'Cache-Control': 'no-store' } }); } catch(error) { return apiError(error); } }
