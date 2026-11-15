import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page, Browser } from 'playwright';
import type { Capture } from '../lib/types';
process.env.LIVESHOT_DATA_DIR='.data/banner-check';
process.env.LIVESHOT_MODE='local';
async function main(){
 const {localDriver,ensureLocalGolden}=await import('../lib/machine/local');
 const runtime=(globalThis as unknown as {__liveshotLocal:{machines:Map<string,{page:Page}>;browser?:Promise<Browser>}}).__liveshotLocal;
 let golden:string|undefined,copy:string|undefined;
 const out=path.resolve('.data/banner-check');await fs.mkdir(out,{recursive:true});
 try{
  golden=(await ensureLocalGolden()).sandboxId;const original=runtime.machines.get(golden)!.page;
  await original.getByTestId('add-tray').click();await original.getByTestId('bag-button').click();await original.getByTestId('coupon-input').fill('WELCOME10');await original.getByTestId('apply-coupon').click();await original.getByTestId('applied-coupon').waitFor();
  const quantity=original.waitForResponse(r=>r.url().endsWith('/api/cart/quantity'));await original.getByTestId('increase-tray').click();await quantity;
  await original.getByTestId('pay-button').click();await original.getByTestId('checkout-error').waitFor();await original.mouse.move(0,0);
  const saved=JSON.parse((await localDriver.exec(golden,'curl -s localhost:$PORT/api/debug/state')).output);assert.equal(saved.lastPaymentError.ref,'PAY-500');
  const captureId='saved-error-check';const source=await localDriver.capture(golden,captureId);const still=await localDriver.screenshot(golden);
  const capture:Capture={id:captureId,createdAt:Date.now(),mode:'local',stillPath:'',width:1024,height:768,sourceRef:source.sourceRef,logsTail:'',debugState:saved};
  copy=(await localDriver.spawn(capture,'banner-test')).sandboxId;const restored=runtime.machines.get(copy)!.page;
  await restored.getByTestId('checkout-error').waitFor();assert.ok((await restored.getByTestId('checkout-error').innerText()).includes(saved.lastPaymentError.message));
  await restored.mouse.move(0,0);
  const live=await localDriver.screenshot(copy);
  await fs.writeFile(path.join(out,'original.jpg'),Buffer.from(still.base64,'base64'));await fs.writeFile(path.join(out,'restored.jpg'),Buffer.from(live.base64,'base64'));
  const banner=await restored.getByTestId('checkout-error').boundingBox();assert.ok(banner);
  const comparison=await restored.evaluate(async({a,b,banner})=>{
    const decoded:Uint8ClampedArray[]=[];
    for(const data of [a,b]){const image=new Image();image.src=`data:image/jpeg;base64,${data}`;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d')!;context.drawImage(image,0,0);decoded.push(context.getImageData(0,0,image.width,image.height).data);}
    const [x,y]=decoded;let different=0,bannerDifferent=0;
    for(let i=0;i<x.length;i+=4){if(x[i]===y[i]&&x[i+1]===y[i+1]&&x[i+2]===y[i+2])continue;different++;const px=(i/4)%1024,py=Math.floor(i/4/1024);if(px>=banner.x&&px<banner.x+banner.width&&py>=banner.y&&py<banner.y+banner.height)bannerDifferent++;}
    return {different,bannerDifferent,total:1024*768};
  },{a:still.base64,b:live.base64,banner});
  assert.equal(comparison.bannerDifferent,0,'Restored error banner must exactly match captured banner');
  assert.ok(comparison.different/comparison.total<0.001,'Restored checkout must visually match still (allow tiny unrelated paint differences)');
  await fs.writeFile(path.join(out,'comparison.json'),JSON.stringify(comparison,null,2));
  await restored.reload();await restored.getByTestId('checkout-error').waitFor();assert.ok(await restored.getByTestId('pay-button').isVisible());
  const removed=restored.waitForResponse(r=>r.url().endsWith('/api/coupon')&&r.request().method()==='DELETE');await restored.getByTestId('remove-coupon').click();await removed;await restored.getByTestId('coupon-input').waitFor();assert.equal(await restored.getByTestId('checkout-error').count(),0);
  await restored.getByTestId('pay-button').click();await restored.getByTestId('order-id').waitFor();const paid=JSON.parse((await localDriver.exec(copy,'curl -s localhost:$PORT/api/debug/state')).output);assert.ok(paid.order);assert.equal(paid.lastPaymentError,null);
  assert.deepEqual(JSON.parse((await localDriver.exec(golden,'curl -s localhost:$PORT/api/debug/state')).output),saved);assert.ok(await original.getByTestId('checkout-error').isVisible());
  console.log('PASS saved payment error: persisted, restored before input, identical banner pixels and matching checkout, page reload, clears on coupon removal/payment, golden isolated.');
 }finally{if(copy)await localDriver.destroy(copy);if(golden)await localDriver.destroy(golden);await(await runtime.browser)?.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
