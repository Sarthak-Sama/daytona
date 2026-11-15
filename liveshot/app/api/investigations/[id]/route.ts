import { store } from '@/lib/store';
import { ApiError, apiError, publicValue } from '@/lib/backend';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const investigation=store.investigations.get(id);if(!investigation)throw new ApiError(404,'Investigation not found.');return Response.json(publicValue(investigation),{headers:{'Cache-Control':'no-store'}});}catch(error){return apiError(error);}}
