// UNTESTED: written before credentials were available
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main() {
  const {config}=await import('../lib/config');
  const {daytonaClient}=await import('../lib/machine/daytona');
  const {provisionMachine,readMeasurements,takeScreenshot,sdkCall,missingResource,verifyShopWindow}=await import('../lib/machine/provision');
  const fs=await import('node:fs/promises'); const path=await import('node:path');
  const file=path.join(config.dataDir,'golden.json');
  if(process.argv.includes('--reuse')) {
    try {
      const saved=JSON.parse(await fs.readFile(file,'utf8'));
      const sb=await sdkCall(()=>daytonaClient().get(saved.sandboxId),30_000,true);
      if(sb.state==='started') {
        await verifyShopWindow(sb);
        const shot=await takeScreenshot(sb,await readMeasurements());
        const image=path.join(config.dataDir,shot.mime==='image/png'?'golden.png':'golden.jpg');
        await fs.writeFile(image,Buffer.from(shot.base64,'base64'));
        console.log(`Reused golden machine. Confirm the kiosk shop image: ${image}`);
        return;
      }
    } catch(error) {
      if((error as NodeJS.ErrnoException).code!=='ENOENT' && !missingResource(error)) throw error;
    }
  }
  if(!['fork','hot-snapshot','rehydrate'].includes(config.mode)) throw new Error('Set LIVESHOT_MODE from credentialed preflight before setup-golden.');
  const measured=await readMeasurements();
  const sb=await provisionMachine({role:'golden',name:`ls-golden-${Date.now()}`,rehydrate:config.mode==='rehydrate',measurements:measured,client:daytonaClient()});
  // Persist the handle before screenshot verification so cleanup/reuse can recover it.
  await fs.mkdir(config.dataDir,{recursive:true}); await fs.writeFile(file,JSON.stringify({sandboxId:sb.id}));
  const shot=await takeScreenshot(sb,measured); const image=path.join(config.dataDir,shot.mime==='image/png'?'golden.png':'golden.jpg');
  await fs.writeFile(image,Buffer.from(shot.base64,'base64')); console.log(`Golden machine ready. Confirm the kiosk shop image: ${image}`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
