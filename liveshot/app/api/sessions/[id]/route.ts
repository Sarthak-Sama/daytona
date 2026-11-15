export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { apiError, closeSession, inspectSession, publicValue } from '@/lib/backend';
import type { RouteContext } from '@/lib/api';
export async function GET(_: Request, { params }: RouteContext) { try { const session = await inspectSession((await params).id); return Response.json(publicValue({ status: session.status, kind: session.kind, label: session.label, error: session.error })); } catch(error) { return apiError(error); } }
export async function DELETE(_: Request, { params }: RouteContext) { try { await closeSession((await params).id); return Response.json({ ok: true }); } catch(error) { return apiError(error); } }
