export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { apiError, captureMetadata } from '@/lib/backend';
import type { RouteContext } from '@/lib/api';
export async function GET(_: Request, { params }: RouteContext) { try { return Response.json(captureMetadata((await params).id)); } catch(error) { return apiError(error); } }
