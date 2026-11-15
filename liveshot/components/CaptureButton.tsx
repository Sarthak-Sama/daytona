'use client';
import { useState } from 'react';
import { api } from './client-api';
export default function CaptureButton({ note, disabled, onCapture }: { note: string; disabled?: boolean; onCapture: (capture: {id:string;url:string})=>void }) {
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <div><button disabled={disabled||busy} onClick={async()=>{setBusy(true);setError('');try{onCapture(await api('/api/captures',{method:'POST',body:JSON.stringify({note})}));}catch(err){setError((err as Error).message);}finally{setBusy(false);}}} className="flex min-h-14 w-full items-center justify-between gap-4 rounded bg-lime-200 px-5 py-4 text-base font-semibold text-[#151710] transition hover:bg-lime-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-200 disabled:cursor-wait disabled:opacity-40"><span>{busy?'Capturing this moment…':'Capture LIVESHOT'}</span><span aria-hidden="true">{busy?'◌':'↗'}</span></button>{error&&<p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}</div>;
}
