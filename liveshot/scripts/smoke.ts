import assert from 'node:assert/strict';
const base = process.env.BASE_URL || 'http://localhost:4000';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function json(route: string, init?: RequestInit) {
 const response = await fetch(`${base}${route}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
 const data = await response.json();
 assert.ok(response.ok, `${route}: HTTP ${response.status}: ${JSON.stringify(data)}`);
 assert.ok(!JSON.stringify(data).match(/sandboxId|sourceRef|stillPath|\/Users\/|\/home\/|nos_[A-Za-z0-9]/), `${route} leaked internal metadata`);
 return data;
}
async function ready(sessionId: string) {
 for(let n=0;n<180;n++) { const state=await json(`/api/sessions/${sessionId}`); if(state.status==='ready') return; assert.notEqual(state.status,'error'); assert.notEqual(state.status,'closed'); await pause(500); }
 throw new Error('Session startup timed out');
}
async function input(id: string, event: unknown) { return json(`/api/sessions/${id}/input`, { method:'POST', body:JSON.stringify(event) }); }
async function main() {
 const { sessionId: golden } = await json('/api/golden'); await ready(golden);
 // Shop's fixed 1024x768 viewport has stable navigation targets; no agent receives this script.
 const frame=await json(`/api/sessions/${golden}/frame`); assert.ok(frame.image?.length>1000);
 const capture=await json('/api/captures',{method:'POST',body:JSON.stringify({note:'Checkout investigation smoke test'})});
 assert.ok(capture.id && capture.url);
 const still=await fetch(`${base}/api/captures/${capture.id}/still`); assert.ok(still.ok); assert.ok(still.headers.get('content-type')?.startsWith('image/')); assert.ok((await still.arrayBuffer()).byteLength>1000);
 const one=await json(`/api/captures/${capture.id}/sessions`,{method:'POST',body:'{}'}); await ready(one.sessionId);
 const before=await json(`/api/sessions/${one.sessionId}/frame`);
 // Bag navigation changes pixels without changing the captured cart, irrespective of its current state.
 await input(one.sessionId,{type:'click',x:934,y:73});
 let after=await json(`/api/sessions/${one.sessionId}/frame`);
 if (before.image===after.image) { await input(one.sessionId,{type:'click',x:180,y:73}); after=await json(`/api/sessions/${one.sessionId}/frame`); }
 assert.notEqual(before.image,after.image,'Click should change the real shop frame');
 const two=await json(`/api/captures/${capture.id}/sessions`,{method:'POST',body:'{}'}); await ready(two.sessionId); assert.notEqual(one.sessionId,two.sessionId);
 const original=await json(`/api/sessions/${golden}/frame`); assert.equal(frame.image,original.image,'Copy input must not change golden pixels');
 // Free copies so Detective can reserve a protected investigation slot under the default quota.
 await json(`/api/sessions/${one.sessionId}`,{method:'DELETE'}); await json(`/api/sessions/${two.sessionId}`,{method:'DELETE'});
 const {investigationId}=await json(`/api/captures/${capture.id}/investigate`,{method:'POST',body:'{}'});
 for(let n=0;n<300;n++) {
  const investigation=await json(`/api/investigations/${investigationId}`);
  assert.notEqual(investigation.status,'error',investigation.error);
  if(investigation.status==='done') { assert.ok(investigation.report); assert.ok(investigation.steps.some((s:{kind:string})=>s.kind==='command')); for(const evidence of investigation.report.evidence) { const step=investigation.steps.find((s:{n:number})=>s.n===evidence.step); assert.ok(step?.output?.replace(/\s+/g,' ').includes(evidence.excerpt.replace(/\s+/g,' '))); } console.log('PASS local API smoke: capture, still, independent copies, real image input, golden isolation, Detective evidence.'); return; }
  await pause(1000);
 }
 throw new Error('Investigation timed out');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
