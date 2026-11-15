export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { ApiError, apiError, getSession, sessionFrame } from '@/lib/backend';
import { nextFrame } from '@/lib/frames';
import type { RouteContext } from '@/lib/api';
const headers = { 'Cache-Control': 'no-store' };
// Plain GET takes one screenshot. With ?after=<ts> it long-polls the live frame hub and answers
// as soon as a newer frame exists: { image, mime, ts }, or { ts, same: true } when the screen has not changed.
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const id = (await params).id, after = new URL(request.url).searchParams.get('after');
    if (after === null) return Response.json(await sessionFrame(id), { headers });
    if (getSession(id).status !== 'ready') throw new ApiError(409, 'This copy is not ready.');
    const frame = await nextFrame(id, Number(after) || 0, request.signal);
    if ('closed' in frame) throw new ApiError(409, frame.closed);
    return Response.json('same' in frame ? { ts: frame.same, same: true } : frame, { headers });
  } catch(error) { return apiError(error); }
}
