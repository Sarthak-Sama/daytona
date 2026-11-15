import { z } from 'zod';
import { ApiError } from './backend';
export type RouteContext = { params: Promise<{ id: string }> };
export async function jsonBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, 'Request body must be valid JSON.'); }
}
const coordinate = z.number().finite().min(-100000).max(100000);
export const inputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), x: coordinate, y: coordinate, button: z.enum(['left', 'right']).optional(), double: z.boolean().optional() }),
  z.object({ type: z.literal('type'), text: z.string().max(4096) }),
  z.object({ type: z.literal('key'), key: z.string().min(1).max(40), modifiers: z.array(z.enum(['ctrl', 'control', 'alt', 'shift', 'meta', 'super'])).max(4).optional() }),
  z.object({ type: z.literal('scroll'), x: coordinate, y: coordinate, direction: z.enum(['up', 'down']), amount: z.number().int().min(1).max(100).optional() }),
]);
export const captureSchema = z.object({ note: z.string().trim().max(2000).optional() });
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T { const parsed = schema.safeParse(body); if (!parsed.success) throw new ApiError(400, 'Invalid request body.'); return parsed.data; }
