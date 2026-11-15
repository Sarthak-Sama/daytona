# Local acceptance verification

Verified on 2026-11-15 using real Playwright Chromium, a local Next.js server on port 4001 and isolated `.data/qa-instance` state. The main app remains on port 4000. No Daytona or Nosana requests were made, no credentials were supplied, and DEMO_NOTES.md was never read or included in a prompt, machine copy or fixture.

## Passed

- The tester console accepted image-only clicks and keyboard typing: add tray, open bag, type WELCOME10, apply coupon, increase quantity and Pay. The payment error appeared in the actual viewer image.
- Capture button returned a usable share link. A new browser page displayed the saved still in **206 ms** on the final run, with Next.js routes already compiled. Cold development compilation is excluded from this measurement.
- Clicking Remove coupon on the still woke a private copy and replayed that exact first click. Paying in the copy displayed the order-confirmed screen. Tester state stayed unchanged.
- A second tab started from captured state, independent of the first copy. A same-tab reload resumed its existing session.
- Small quantity buttons received correctly mapped clicks with the image displayed at both 512px and 1024px wide. The saved still remained byte-for-byte unchanged.
- STUB Detective executed real shell commands, produced a runtime-output report and linked evidence to actual transcript command elements. Root cause explicitly says no model was used.
- Invalid evidence was rejected and retried. Whitespace-only evidence was rejected. A stub that never submitted a report reached eight command turns and produced the forced final report.
- An injected initial-frame HTTP 500 returned the share page to STILL with Retry. Retrying successfully reached LIVE.
- API smoke passed capture, still, session creation, real screenshot change, golden isolation and Detective evidence checks. Checked API responses contained no private machine identifiers, internal reference fields, credentials or absolute local paths.
- Desktop 1560px and mobile 390px layouts were checked, with LOCAL MODE visible and no mobile horizontal overflow. No tester client exceptions were captured.
- `npx tsc --noEmit` passed for the entire project, including the untested Daytona files. The optimized Next.js production build also passed (two filesystem tracing warnings for runtime-configurable data/shop paths).
- Final integration additionally reran smoke and TypeScript after adding lazy persisted-session validation and closing interrupted startup jobs on reload.

## Commands used

```sh
LIVESHOT_DIST_DIR=.next-qa LIVESHOT_DATA_DIR=.data/qa-instance LIVESHOT_MODE=local LLM_BASE_URL=stub npx next dev --hostname 127.0.0.1 --port 4001
BASE_URL=http://127.0.0.1:4001 LIVESHOT_DATA_DIR=.data/qa-instance npx tsx scripts/browser-qa.ts
BASE_URL=http://127.0.0.1:4001 LIVESHOT_DATA_DIR=.data/qa-instance npx tsx scripts/fault-qa.ts
BASE_URL=http://127.0.0.1:4001 npm run smoke
npx tsx scripts/test-agent.ts
npx tsc --noEmit
```

The browser acceptance script assumes a fresh empty tester cart; restart its isolated Next process before rerunning it. The fault script uses an existing capture from that isolated store.

## Artifacts

- `.data/qa/tester-payment-error.png`
- `.data/qa/copy-order-confirmed.png`
- `.data/qa/detective-evidence.png`
- `.data/qa/mobile-still.png`
- `.data/qa/recovered-first-frame.png`
- `.data/qa/browser-results.json`

## Not verified without credentials

Daytona preflight, remote desktop preservation, fork chains, remote quota, hot snapshots, rehydration on a real account and cloud cleanup are written/typechecked but unrun. Nosana model availability/tool support and real-model Detective quality remain untested. A physical second device and external tunnel were not tested here. Local mode restores server state with a fresh browser; the missing error banner until Pay is pressed again is expected. The plan's two full rehearsals and backup video recording were not part of this automated QA run.
