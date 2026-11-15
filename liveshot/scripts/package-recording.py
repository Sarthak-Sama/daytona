"""Join actual browser recordings and add chapter captions below their pixels."""
from pathlib import Path
import json,subprocess
from PIL import Image,ImageDraw,ImageFont
root=Path('.data/demo-recording').resolve()
report=json.loads((root/'results.json').read_text())
def duration(p):
 return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(p)]).decode().split('"duration": "')[1].split('"')[0])
clips=[root/name for name in report['clips']]
durations=[duration(p) for p in clips]
# Only omit the initial blank browser before the first loaded product screen.
trim=max(0,report['chapters'][0]['at']-.3)
events=[]
for chapter in report['chapters']:
 offset=0 if chapter['clip']==1 else durations[0]
 events.append({'at':max(0,offset+chapter['at']-trim),'title':chapter['title']})
events[0]['at']=0
total=sum(durations)-trim
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',27)
small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',17)
concat=[]
for i,event in enumerate(events):
 im=Image.new('RGB',(1560,86),'#0c0e0d');d=ImageDraw.Draw(im)
 d.line((0,0,1560,0),fill='#455433',width=2)
 d.text((26,14),event['title'],font=font,fill='#d9f99d')
 d.text((26,52),'LIVESHOT  |  REAL LOCAL BROWSER RECORDING  |  DETECTIVE: STUB, NO MODEL USED',font=small,fill='#939c8d')
 filename=root/f'caption-{i:02}.png';im.save(filename)
 end=events[i+1]['at'] if i+1<len(events) else total
 concat.extend([f"file '{filename}'",f'duration {max(.04,end-event["at"]):.3f}'])
concat.append(f"file '{filename}'")
(root/'captions.ffconcat').write_text('\n'.join(concat)+'\n')
(root/'clips.ffconcat').write_text('\n'.join(f"file '{p}'" for p in clips)+'\n')
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',str(root/'clips.ffconcat'),'-ss',str(trim),'-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(root/'walkthrough-raw.mp4')],check=True)
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(root/'walkthrough-raw.mp4'),'-f','concat','-safe','0','-i',str(root/'captions.ffconcat'),'-filter_complex','[0:v]pad=iw:ih+86:0:0:color=0x0c0e0d[screen];[screen][1:v]overlay=0:H-h:shortest=1[v]','-map','[v]','-an','-r','25','-t',str(total),'-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',str(root/'liveshot-demo.mp4')],check=True)
report.update({'videoSeconds':total,'videoChapters':events,'editing':'Browser clips joined at new-tab transition; chapter captions added below app. Initial blank page omitted. No product interaction sped up or reconstructed.'})
(root/'results.json').write_text(json.dumps(report,indent=2))
print(f'Video ready: {total:.1f}s, {root / "liveshot-demo.mp4"}')
