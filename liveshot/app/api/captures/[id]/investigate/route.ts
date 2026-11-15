import { startInvestigation } from '@/lib/agent/detective';
import { apiError } from '@/lib/backend';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const investigation=await startInvestigation(id);return Response.json({investigationId:investigation.id});}catch(error){return apiError(error);}}
