export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { apiError, sessionInput } from '@/lib/backend';
import { inputSchema, jsonBody, parseBody, type RouteContext } from '@/lib/api';
export async function POST(request: Request, { params }: RouteContext) { try { const event = parseBody(inputSchema, await jsonBody(request)); return Response.json(await sessionInput((await params).id, event, new URL(request.url).searchParams.get('stream') === '1'), { headers: { 'Cache-Control': 'no-store' } }); } catch(error) { return apiError(error); } }
