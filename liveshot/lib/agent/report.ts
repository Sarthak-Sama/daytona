import { z } from 'zod';
import type { AgentStep, BugReport } from '../types';
export const reportSchema = z.object({ title:z.string().min(1), observedError:z.string(), reproSteps:z.array(z.string()), rootCause:z.string(), evidence:z.array(z.object({step:z.number().int().positive(),excerpt:z.string().trim().min(1)})), suggestedFix:z.string(), confidence:z.number().min(0).max(1), uncertainty:z.string() });
export const normalized = (s:string) => s.replace(/\s+/g,' ').trim();
export function validateReport(value:unknown, steps:AgentStep[]) {
 const parsed=reportSchema.safeParse(value);
 if(!parsed.success) return { errors:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`), report:undefined };
 const report:BugReport=parsed.data;
 const valid=report.evidence.filter(e=>steps.some(s=>s.kind==='command'&&s.n===e.step&&normalized(s.output||'').includes(normalized(e.excerpt))));
 const errors=report.evidence.filter(e=>!valid.includes(e)).map(e=>`Evidence for step ${e.step} is not a substring of that command's output.`);
 return {errors,report:{...report,evidence:valid}};
}
/** Accept JSON surrounded by fences or reasoning, without relying on a greedy regex. */
export function parseObject(text:string):unknown {
 const value=text.replace(/<think>[\s\S]*?<\/think>/gi,'');
 let start=-1,depth=0,quoted=false,escaped=false;
 for(let i=0;i<value.length;i++){const c=value[i]; if(start<0){if(c==='{'){start=i;depth=1;}continue;} if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;} if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return JSON.parse(value.slice(start,i+1));}
 throw new Error('No balanced JSON object found');
}
