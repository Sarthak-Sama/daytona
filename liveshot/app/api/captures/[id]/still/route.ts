export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import fs from 'node:fs/promises';
import { apiError, getCapture, ApiError } from '@/lib/backend';
import type { RouteContext } from '@/lib/api';
export async function GET(_: Request, { params }: RouteContext) { try { const capture = getCapture((await params).id); let bytes: Buffer; try { bytes = await fs.readFile(capture.stillPath); } catch { throw new ApiError(404, 'The stored still is unavailable.'); } const mime = capture.stillPath.endsWith('.png') ? 'image/png' : capture.stillPath.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg'; return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } }); } catch(error) { return apiError(error); } }
