import assert from 'node:assert/strict';
import { exec as shell } from 'node:child_process';
import { runLoop } from '../lib/agent/loop';
import { createStub, type Message } from '../lib/agent/llm';
import { parseObject, validateReport } from '../lib/agent/report';
import type { AgentStep } from '../lib/types';
async function scenario(options:{invalidEvidence?:boolean;neverSubmit?:boolean}){
 const steps:AgentStep[]=[];const messages:Message[]=[{role:'system',content:'Exercise the command loop.'}];
 // These actual shell outputs deliberately contain no shop diagnosis or explanatory fixture.
 const exec=async(command:string)=>new Promise<{exitCode:number;output:string}>(resolve=>shell(`printf '%s\\n' ${JSON.stringify(command.includes('/api/checkout')?'{}':command.includes('debug/state')?'{}':'runtime probe output')}`,(error,stdout,stderr)=>resolve({exitCode:error?1:0,output:stdout+stderr})));
 const report=await runLoop({llm:createStub(options),messages,steps,exec,changed:()=>{},totalMs:5000,turnMs:1000});
 assert.equal(report.rootCause,'stub run: no model was used');assert.equal(validateReport(report,steps).errors.length,0);
 return {steps,messages,report};
}
async function main(){
 const standard=await scenario({});assert.equal(standard.steps.filter(s=>s.kind==='command').length,4);assert.ok(standard.report.evidence.length);
 const retry=await scenario({invalidEvidence:true});assert.ok(retry.steps.some(s=>s.text?.includes('Report validation rejected')));assert.ok(retry.messages.some(m=>String(m.content).includes('Report rejected:')));assert.ok(!JSON.stringify(retry.report).includes('THIS_EXCERPT_NEVER_APPEARED'));
 const forced=await scenario({neverSubmit:true});assert.equal(forced.steps.filter(s=>s.kind==='command').length,8);assert.ok(forced.steps.some(s=>s.text?.includes('Forced final report')));
 assert.deepEqual(parseObject('prefix <think>ignore {bad}</think> ```json\n{"a":"brace } inside", "b":{}}\n```'),{a:'brace } inside',b:{}});
 assert.ok(validateReport({...standard.report,evidence:[{step:999,excerpt:'fake'}]},standard.steps).errors.length);
 console.log('PASS agent loop: real shell outputs, four commands, invalid evidence rejected and retried, eight-turn cap and forced final, JSON parser.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
