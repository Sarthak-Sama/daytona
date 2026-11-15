export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { apiError, captureGolden } from '@/lib/backend';
import { captureSchema, jsonBody, parseBody } from '@/lib/api';
export async function POST(request: Request) { try { const body = parseBody(captureSchema, await jsonBody(request)); const capture = await captureGolden(body.note); return Response.json({ id: capture.id, url: `/s/${capture.id}` }); } catch(error) { return apiError(error); } }
