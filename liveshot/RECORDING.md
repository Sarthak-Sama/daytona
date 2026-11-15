# Recorded end-to-end walkthrough

The final fresh run passed against an isolated production Next.js instance on port 4003. This is a real Playwright browser recording of real local shop processes, not an animated mockup. The two browser-tab recordings are joined at the new-tab transition; captions are added below the app pixels. Initial blank-page frames are omitted. Product interactions are not sped up. The recording is silent.

Video: `.data/demo-recording/liveshot-demo.mp4` (64 seconds, H.264, 1560×1166, about 2.8 MB).

## Chapters

- 0:00 — 01  LOCAL MODE — a real browser controls a real shop
- 0:15 — 02  Bug reproduced: coupon + quantity change causes payment failure
- 0:19 — 03  Capture creates a share link, QR code, still, state and logs
- 0:21 — 04  The share link starts as an ordinary still image
- 0:25 — 05  First click wakes a private copy AND removes its coupon
- 0:29 — 06  The private copy completes checkout successfully
- 0:31 — 07  Back at the tester: the original cart is still broken
- 0:36 — 08  A NEW TAB starts from the captured cart, not the completed order
- 0:40 — 09  Pay fails again in the second copy — the captured bug survived
- 0:43 — 10  AI Detective gets its own copy — explicitly labeled STUB
- 0:46 — 11  Report quotes real command outputs; no model diagnosis is claimed
- 0:50 — 12  Click evidence to highlight the command that produced it
- 0:54 — 13  Split view: untouched capture, live private copy, Detective transcript
- 0:58 — 14  The split view is interactive too; the original stays untouched

## Verified

- Image-only bug reproduction, capture, first-click replay and successful private checkout
- Original tester state remained unchanged
- Real new-tab copy has independent id and captured state
- STUB executed real commands and every evidence quote matches its output
- Split-view small-target input works and original remains isolated
- No browser JavaScript exceptions
- Production build, TypeScript, API smoke, first-frame failure/retry, whitespace-evidence rejection and agent failure tests passed.

## Limits

- LOCAL MODE restores server state in a fresh browser; the error banner can disappear until Pay is pressed again.
- Detective is a deterministic STUB using real shell output, not a model diagnosis.
- Daytona and Nosana remain unrun without credentials.
- The default three-copy quota evicts older idle copies; the first human copy is shown closed after later copies are created.

## Repeat

Use a fresh data directory when repeating this run. The recorder expects an empty tester cart.

```sh
LIVESHOT_DIST_DIR=.next-build npm run build
LIVESHOT_DIST_DIR=.next-build LIVESHOT_DATA_DIR=.data/new-recording LIVESHOT_MODE=local LLM_BASE_URL=stub npx next start --hostname 127.0.0.1 --port 4003
# In another terminal:
BASE_URL=http://127.0.0.1:4003 LIVESHOT_DATA_DIR=.data/new-recording npx tsx scripts/record-demo.ts
.data/video-tools/bin/python scripts/package-recording.py
```

Packaging requires Pillow in `.data/video-tools` and ffmpeg/ffprobe.
