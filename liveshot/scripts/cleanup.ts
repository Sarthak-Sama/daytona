// UNTESTED: written before credentials were available
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main() {
  const {daytonaClient}=await import('../lib/machine/daytona'); const {sdkCall,deleteIfPresent}=await import('../lib/machine/provision');
  const client=daytonaClient();
  const list=await sdkCall(async()=>{const items=[];for await(const sb of client.list({labels:{app:'liveshot'}}))items.push(sb);return items;},60_000,true);
  const pending=new Map(list.map(sb=>[sb.id,sb])); const errors:string[]=[];
  while(pending.size) {
    let progress=false;
    const ordered=[...pending.values()].sort((a,b)=>({session:0,preflight:0,capture:1,golden:2}[a.labels.role as 'golden']??0)-({session:0,preflight:0,capture:1,golden:2}[b.labels.role as 'golden']??0));
    for(const sb of ordered) {
      if([...pending.values()].some(child=>child.labels.parentId===sb.id))continue;
      try { await deleteIfPresent(()=>sb.delete(60,true));pending.delete(sb.id);progress=true;console.log(`Deleted ${sb.labels.role || 'machine'}`); }
      catch(error) { errors.push(String(error)); }
    }
    if(!progress)throw new Error(`Cleanup could not delete ${pending.size} machines. Parent/child constraints or API errors: ${errors.slice(-3).join('; ')}`);
  }
  // Memory snapshots are account resources too; only delete this application's named captures.
  const {config}=await import('../lib/config'); const fs=await import('node:fs/promises'); const path=await import('node:path');
  const snapshotNames=new Set<string>();
  const directory=path.join(config.dataDir,'snapshots');
  try { for(const name of await fs.readdir(directory))snapshotNames.add(name); }
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  try {
    const saved=JSON.parse(await fs.readFile(path.join(config.dataDir,'store.json'),'utf8'));
    for(const [,capture] of saved.captures || [])if(capture.mode==='hot-snapshot')snapshotNames.add(capture.sourceRef);
  } catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const remaining:string[]=[];
  for(const name of snapshotNames){
    try {
      await deleteIfPresent(()=>client.snapshot.delete(name));
      await fs.rm(path.join(directory,path.basename(name)),{force:true});
    } catch(error){remaining.push(name+': '+String(error));}
  }
  if(remaining.length)throw Error('Snapshot cleanup incomplete: '+remaining.join(', '));
  await fs.rm(path.join(config.dataDir,'golden.json'),{force:true}); console.log('PASS cleanup: every app=liveshot machine deleted.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
