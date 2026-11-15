import type { AgentStep, BugReport } from '../types';
import type { LlmRuntime, Message, ToolCall } from './llm';
import { parseObject, validateReport } from './report';
const reportProperties={title:{type:'string'},observedError:{type:'string'},reproSteps:{type:'array',items:{type:'string'}},rootCause:{type:'string'},evidence:{type:'array',items:{type:'object',properties:{step:{type:'integer'},excerpt:{type:'string'}},required:['step','excerpt']}},suggestedFix:{type:'string'},confidence:{type:'number',minimum:0,maximum:1},uncertainty:{type:'string'}};
const tools=[{type:'function',function:{name:'run_shell',description:'Run a shell command in your private shop copy.',parameters:{type:'object',properties:{command:{type:'string'}},required:['command']}}},{type:'function',function:{name:'submit_report',description:'Finish with a report supported by real command output.',parameters:{type:'object',properties:reportProperties,required:Object.keys(reportProperties)}}}];
export type LoopOptions={llm:LlmRuntime;messages:Message[];steps:AgentStep[];exec:(command:string)=>Promise<{exitCode:number;output:string}>;changed:()=>void;redact?:(s:string)=>string;protocol?:'tools'|'json';totalMs?:number;turnMs?:number};
const truncate=(s:string)=>s.length>4000?`${s.slice(0,1950)}\n… truncated …\n${s.slice(-2000)}`:s;
export async function runLoop(options:LoopOptions):Promise<BugReport>{
 const {llm,messages,steps,changed}=options;const deadline=Date.now()+(options.totalMs??240_000);let invalidReports=0;
 const clean=options.redact||((s:string)=>s);let protocol=llm.stub?'tools':options.protocol||'tools';
 const add=(step:Omit<AgentStep,'n'>)=>{const value={...step,n:steps.length+1};steps.push(value);changed();return value;};
 async function call(enabled:boolean){
  const remaining=deadline-Date.now();if(remaining<=0)throw new Error('Investigation reached its four-minute limit.');
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Model turn timed out.'));},Math.min(options.turnMs??90_000,remaining));});
  try{return await Promise.race([llm.client.chat.completions.create({model:llm.model,messages,...(enabled&&protocol==='tools'?{tools,tool_choice:'auto'}:{})},{signal:controller.signal}),timeout]);}finally{if(timer)clearTimeout(timer);}
 }
 function accept(value:unknown):BugReport|undefined{
  const checked=validateReport(value,steps);if(!checked.errors.length&&checked.report)return checked.report;
  invalidReports++;const error=checked.errors.join(' ');
  add({kind:'thought',text:`Report validation rejected: ${clean(error)}`});
  if(invalidReports<2){messages.push({role:'user',content:`Report rejected: ${error} Correct the report. Every evidence excerpt must quote an actual command output.`});return;}
  if(checked.report)return {...checked.report,uncertainty:`${checked.report.uncertainty} Invalid evidence items were dropped after validation.`};
  return {title:'Investigation incomplete',observedError:'A valid report could not be produced.',reproSteps:[],rootCause:llm.stub?'stub run: no model was used':'Not confirmed.',evidence:[],suggestedFix:'Review the command transcript.',confidence:0,uncertainty:'The model returned an invalid report twice; no unsupported evidence is shown.'};
 }
 async function command(value:unknown,tool?:ToolCall){
  const command=typeof value==='object'&&value&&'command'in value&&typeof value.command==='string'?value.command:'';
  if(!command||command.length>8000){messages.push({role:tool?'tool':'user',...(tool?{tool_call_id:tool.id}:{}),content:'Invalid command: provide a nonempty command up to 8000 characters.'});return;}
  const remaining=deadline-Date.now();
  if(remaining<=0)throw new Error('Investigation reached its four-minute limit.');
  const start=Date.now();let result:{exitCode:number;output:string};let timer:ReturnType<typeof setTimeout>|undefined;
  try{result=await Promise.race([options.exec(command),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Command budget expired.')),Math.min(20_000,remaining));})]);}catch{result={exitCode:1,output:'Command execution failed or timed out.'};}finally{if(timer)clearTimeout(timer);}
  const step=add({kind:'command',command:clean(command),exitCode:result.exitCode,output:truncate(clean(result.output)),ms:Date.now()-start});
  messages.push({role:tool?'tool':'user',...(tool?{tool_call_id:tool.id}:{}),content:JSON.stringify({n:step.n,command:step.command,exitCode:step.exitCode,output:step.output})});
 }
 for(let turn=0;turn<8;turn++){
  const response=await call(true);const message=response.choices[0]?.message;if(!message)throw new Error('Model returned no message.');
  if(protocol==='tools'&&message.tool_calls?.length){
   messages.push(message);
   for(const tool of message.tool_calls){let args:unknown;try{args=JSON.parse(tool.function.arguments);}catch{messages.push({role:'tool',tool_call_id:tool.id,content:'Invalid tool JSON. Retry.'});continue;}
    if(tool.function.name==='run_shell')await command(args,tool);
    else if(tool.function.name==='submit_report'){
     messages.push({role:'tool',tool_call_id:tool.id,content:'Report received for evidence validation.'});const report=accept(args);if(report){add({kind:'report',text:'Report completed with validated evidence.'});return report;}
    }else messages.push({role:'tool',tool_call_id:tool.id,content:'Unknown tool. Use run_shell or submit_report.'});
   }
  }else{
   const text=String(message.content||'');messages.push({role:'assistant',content:text});
   try{const action=parseObject(text) as {action?:string;command?:string;report?:unknown};if(action.action==='run_shell')await command(action);else if(action.action==='report'){const report=accept(action.report);if(report)return report;}else throw new Error('Unknown action');}
   catch{messages.push({role:'user',content:'That was not valid JSON. Send one JSON object: {"action":"run_shell","command":"..."} or {"action":"report","report":{...}}.'});}
   // Servers that ignore tools can continue using the documented JSON fallback.
   if(protocol==='tools'){protocol='json';messages.push({role:'system',content:'Reply with exactly one JSON object: {"action":"run_shell","command":"..."} or {"action":"report","report":{...}}. No tools parameter is available.'});}
  }
 }
 add({kind:'thought',text:'Turn limit reached; requesting a forced final report.'});
 messages.push({role:'user',content:'No turns remain. Return only a BugReport JSON object from the commands already gathered. Do not run more commands. Use fields title, observedError, reproSteps, rootCause, evidence [{step,excerpt}], suggestedFix, confidence, uncertainty.'});
 for(let attempt=0;attempt<2;attempt++){const response=await call(false);let value:unknown;try{value=parseObject(String(response.choices[0]?.message.content||''));}catch{value=null;}const report=accept(value);if(report){add({kind:'report',text:'Forced final report completed.'});return report;}}
 throw new Error('No valid final report was produced.');
}
