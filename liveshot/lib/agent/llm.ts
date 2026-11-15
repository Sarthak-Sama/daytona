import OpenAI from 'openai';
import { config } from '../config';
import type { BugReport } from '../types';
export type ToolCall={id:string;type:'function';function:{name:string;arguments:string}};
export type Message={role:'system'|'user'|'assistant'|'tool';content?:string|null|unknown[];tool_call_id?:string;tool_calls?:ToolCall[]};
export type CompletionRequest={model:string;messages:Message[];tools?:unknown[];tool_choice?:string};
export type LlmClient={chat:{completions:{create:(request:CompletionRequest,options?:{signal?:AbortSignal})=>Promise<{choices:{message:Message}[]}>}}};
export type LlmRuntime={client:LlmClient;model:string;provider:string;stub:boolean};
type Result={n:number;command:string;output:string;exitCode:number};
function results(messages:Message[]):Result[]{return messages.filter(m=>m.role==='tool').flatMap(m=>{try{const v=JSON.parse(String(m.content));return typeof v.n==='number'?[v]:[];}catch{return [];}});}
const shellQuote=(s:string)=>`'${s.replace(/'/g, `'\\''`)}'`;
export function createStub(options:{invalidEvidence?:boolean;neverSubmit?:boolean}={}):LlmRuntime {
 let calls=0,reports=0;
 const client:LlmClient={chat:{completions:{async create(request){
  const outputs=results(request.messages); let name='run_shell',args:unknown;
  const last=outputs.find(r=>r.n===3)?.output||'';let error='';try{const v=JSON.parse(last);error=v.error?.message||Object.keys(v)[0]||'';}catch{error=last.trim().slice(0,100);}
  const commands=['tail -n 40 logs/app.log','curl -s localhost:${PORT:-3000}/api/debug/state',"curl -s -X POST -H 'Content-Type: application/json' -d '{}' localhost:${PORT:-3000}/api/checkout",`grep -rnF -- ${shellQuote(error||'error')} server server.js`];
  const evidence=outputs.slice(0,4).filter(r=>r.output.trim()).map(r=>({step:r.n,excerpt:r.output.trim().slice(0,180)}));
  const report:BugReport={title:'Runtime investigation (STUB)',observedError:outputs[2]?.output.trim().slice(0,350)||'No checkout response was gathered.',reproSteps:outputs.slice(0,4).map(r=>r.command),rootCause:'stub run: no model was used',evidence,suggestedFix:'Review the command evidence and use a real model before presenting an investigation.',confidence:0,uncertainty:'This deterministic stub exercises execution and evidence plumbing; it does not diagnose root cause.'};
  if(!request.tools){return {choices:[{message:{role:'assistant',content:JSON.stringify(report)}}]};}
  if(calls<4){args={command:commands[calls++]};}else if(options.neverSubmit){args={command:'printf "turn-limit probe\\n"'};calls++;}else{name='submit_report';reports++;args=options.invalidEvidence&&reports===1?{...report,evidence:[{step:1,excerpt:'THIS_EXCERPT_NEVER_APPEARED'}]}:report;}
  return {choices:[{message:{role:'assistant',content:null,tool_calls:[{id:`stub-${calls}-${reports}`,type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]};
 }}}};
 return {client,model:'deterministic-runtime-stub',provider:'STUB',stub:true};
}
export async function createLlm():Promise<LlmRuntime>{
 if(!config.llmApiKey||config.llmBaseUrl==='stub')return createStub();
 const client=new OpenAI({apiKey:config.llmApiKey,baseURL:config.llmBaseUrl,timeout:90_000,maxRetries:0});
 const model=config.llmModel||(await client.models.list()).data[0]?.id;
 if(!model)throw new Error('The inference provider returned no models.');
 // Some served reasoning models leave content empty and put the answer in message.reasoning(_content).
 const raw=client as unknown as LlmClient;
 const wrapped:LlmClient={chat:{completions:{async create(request,options){
  const response=await raw.chat.completions.create(request,options);
  for(const choice of response.choices||[]){const m=choice.message as Message&{reasoning?:unknown;reasoning_content?:unknown};
   const empty=m.content==null||(typeof m.content==='string'&&!m.content.trim());
   const alt=typeof m.reasoning_content==='string'?m.reasoning_content:typeof m.reasoning==='string'?m.reasoning:'';
   if(empty&&!m.tool_calls?.length&&alt.trim())m.content=alt;
   delete m.reasoning;delete m.reasoning_content;}
  return response;
 }}}};
 return {client:wrapped,model,provider:config.llmProviderLabel,stub:false};
}
