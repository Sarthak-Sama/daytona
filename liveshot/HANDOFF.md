# LIVESHOT engineering handoff

Date: 2026-11-15, Asia/Tokyo. Workspace: `/Users/yato_sar/hackathon/daytona/liveshot`.

## 1. Read this first

**The local product works. The cloud product has not been exercised.** Capture → share link → still → first click → independent interactive copy has passed real-browser tests. Detective has only been tested with its explicit STUB implementation. No Daytona or Nosana account requests have been made by this work.

The user now has sponsor keys. At handoff, none of `DAYTONA_API_KEY`, `LLM_API_KEY`, or `OPENAI_API_KEY` was detected in this process or this app's `.env.local`. This means the user possesses credentials, not that the application is configured. Put keys in `.env.local`, never in chat, fixtures, reports or source control.

**Latest user-reported issues:** clicking the public screenshot did nothing, and the image looked blurry. The public-click issue was reproduced and resolved by replacing the development server with the production server. The image-quality improvement was discussed but **not implemented** before this handoff request.

**Current live state:** both `http://localhost:4000/api/golden` and the ngrok admin endpoint on port 4040 were unreachable at handoff. Restart the application and tunnel; do not assume earlier terminal sessions survived interruptions.

Git root is `/Users/yato_sar/hackathon/daytona`, one directory above this app. Current HEAD observed: `836ae39 Add Liveshot capture and investigation app`. `git status --short` showed only untracked `scripts/debug-public.ts`; most implementation, including the shop changes, is already in the current checkout. Do not reset or overwrite the user's commits.

## 2. Product intent and truthful claims

Lead with: **“A screenshot that becomes a window into a private computer.”**

1. A tester interacts with the target application through screenshots.
2. Capture saves the picture and a starting point behind it.
3. A recipient opens a share link and sees the picture immediately.
4. Their first click wakes a private copy and is replayed into it.
5. Subsequent clicks and typing operate the real application in that copy.
6. Another recipient starts independently from the same capture.
7. Detective receives a separate copy and investigates with real commands.

Debugging is one use of the product, not its defining interaction. Keep AI in the hackathon demo after the human-copy reveal because it is the Nosana integration.

The image file itself contains no computer. The **share webpage** binds the picture to the captured starting point and controls a working copy. Downloading the JPEG loses interactivity. Reconstructing a computer from an arbitrary uploaded screenshot is unsupported.

Until real preflight proves memory preservation, do not claim “the exact computer, frozen at that moment.” In local/rehydrate mode say **restored state**. Never present STUB as a model or as sponsor inference.

## 3. Repository and instructions

- `LIVESHOT_PLAN.md`: full specification, copied from the supplied Downloads file.
- `API.md`: agreed frontend/backend route contract.
- `../test-app/shop/`: actual demo target; it is not `./shop`.
- `../test-app/shop/CONTRACT.md` and `../test-app/README.md`: target routes and commands.
- `AGENTS.md`: read relevant installed Next.js documentation before changing Next code. Installed Next is **16.4.6**, SDK is **@daytona/sdk 0.231.1**. Do not assume older framework/SDK behavior.
- Relevant local guides: `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`, `01-app/02-guides/environment-variables.md`, and `01-app/03-api-reference/06-cli/next.md`.
- **Never read or send DEMO_NOTES.md to Detective.** It has not been read in this work. Local copies and cloud archives exclude it. Do not feed the full LIVESHOT plan into Detective either; it describes the planted bug.

## 4. Implemented application

| Area | Files / behavior |
|---|---|
| Shared contracts | `lib/types.ts`, `lib/config.ts`, `lib/machine/driver.ts`, `API.md`; local mode is allowed and default |
| Persistence | `lib/store.ts`; globalThis maps mirrored to `.data/store.json`, debounced persistence; interrupted local sessions close on restart |
| Backend coordination | `lib/backend.ts`, `lib/api.ts`; capture locking, per-machine queues, session jobs, validation, quota, prewarm, response redaction |
| Driver selection | `lib/machine/index.ts`; local, mock or Daytona without exposing internal machine handles |
| Local driver | `lib/machine/local.ts`; real shop processes and Playwright Chromium, private directories, persisted state/log restoration |
| Tester | `app/page.tsx`; image input, optional note, capture, link, clipboard and QR |
| Share | `app/s/[id]/page.tsx`, `components/ShareExperience.tsx`; STILL/WAKING/LIVE, first-click replay, reset and session resume |
| Image interaction | `components/LiveshotViewer.tsx`; natural-image coordinate mapping, queued input, buffered text, special keys, wheel, frame preloading and late refresh |
| Copies and split | `CopiesPanel.tsx`, `app/s/[id]/split/page.tsx`; separate human/AI copies and original/live/transcript comparison |
| Detective | `lib/agent/{llm,loop,detective,report}.ts`; OpenAI-compatible inference, tools/JSON protocol, real shell execution, evidence validation and limits |
| Detective UI | `InvestigationPanel.tsx`, `ReportCard.tsx`; command transcript, report, evidence anchors/highlight, model/provider/STUB labels |

Public routes are implemented: golden; session status/delete/frame/input; capture creation/metadata/still/session creation; investigation start/status. See API.md for exact methods and payloads.

Public responses exclude sandbox IDs, source refs, still file paths, configured secrets and absolute local paths. Detective output is redacted before evidence validation. This was checked in local API tests, not a comprehensive security audit.

Quota defaults to three live non-tester sessions. Old idle copies may be evicted; running investigations are protected. Prewarm reserves a ready/starting human copy when quota permits. An old human copy becoming CLOSED after more copies are created can be expected quota behavior.

Each normal new-copy link opens with noopener. Same-tab reload resumes via `sessionStorage`; new tabs opened normally through the product get independent copies. Browser-level Duplicate Tab semantics were not separately verified.

## 5. How local mode works

Each machine has `.data/local/<machineId>/shop`, copied from the real shop excluding node_modules/data/logs. Its node_modules points to the original shop installation. It has its own free port, `PERSIST_STATE=1` server process and Playwright browser context/page at 1024×768.

Capture saves state.json, logs and page information under `.data/local/captures/<captureId>/`. The shop uses React screen state rather than URL routes, so the driver also records checkout visibility and reopens checkout through its bag control.

Spawn copies the captured files before starting a fresh server and browser. Destroy closes the browser context, stops the server and removes its machine directory. Shell commands run in that machine's shop folder with PORT set; localhost:3000 commands are translated to that private port. Output is bounded.

This is separate application processes and browser contexts on one laptop, **not an operating-system security sandbox or complete computer clone**.

## 6. Saved payment-error fix: completed

The user explicitly authorized a shop change beyond the earlier PORT-only restriction.

Changed target files:

- `../test-app/shop/server.js`: `session.lastPaymentError = {message, ref} | null`; payment failure persists that field. Successful cart/coupon mutations, successful payment and reset clear it. Legacy saved sessions missing the field load with null.
- `../test-app/shop/src/main.tsx`: reads the saved error, automatically opens checkout on initial load when it exists, displays it, and clears it after successful recovery actions.
- `../test-app/shop/CONTRACT.md`: documents the new state field and behavior.
- `../test-app/shop/dist/`: rebuilt committed frontend output. Preserve the rebuilt asset/index changes together.
- `../test-app/tests/api.test.mjs`: updated contract expectations and persisted-restart assertions.

The payment-validation bug itself was intentionally left intact. No banner is painted over the screenshot; this is real saved application state.

`npx tsx scripts/test-saved-error.ts` passed persistence, fresh-copy banner visibility before input, reload, recovery and original isolation. Comparison artifact: `.data/banner-check/comparison.json`: **0 differing banner pixels**, 60 differing pixels elsewhere out of 786,432. Do not call the complete screenshots byte-identical; the tiny difference was near the bag count. Images: `.data/banner-check/original.jpg` and `restored.jpg`.

Older captures made before this state field existed cannot be assumed to restore their banner. Make a fresh capture using the updated shop.

## 7. Public dead-click bug: reproduced and addressed

The user observed a fully styled still image that ignored clicks. Reproduction used an ordinary browser through ngrok, including its Visit Site interstitial.

Observed in development mode:

- HTML, CSS and JS responses loaded.
- The page remained at server-rendered defaults: no LOCAL MODE, no capture time, no copies, no live handlers.
- Browser console repeatedly showed `wss://.../_next/hmr` handshake failures with HTTP 503.
- Clicking the screenshot did not transition state.

Switching port 4000 to the **production build** removed this failure. The same public capture then populated metadata/LOCAL MODE and clicking transitioned to LIVE. `scripts/debug-public.ts` retains the reproduction and console/network logging.

This is evidence that production serving resolves the observed public startup failure; the underlying Next development/HMR behavior was not fully analyzed. Do not generalize that all ngrok or Next dev use is broken.

**Use `next build` + `next start` for the shared demo, not `next dev`.** The existing `.next-build` directory was an older build; rebuild current source before the real demo. A later source edit is not present in an already-built server until rebuilt/restarted.

Previously working tunnel origin: `https://ferment-sarcastic-iodine.ngrok-free.dev`. Previously shared updated-banner capture: `/s/kBaDuCVeIO`. These are historical identifiers, not a guarantee of a currently live endpoint. Ngrok is installed; cloudflared was not found. An ordinary visitor may need to click Visit Site once.

## 8. Resolution complaint: STILL OPEN

Current local screenshots are **JPEG quality 70, 1024×768, deviceScaleFactor 1**. The viewer can enlarge that raster, and Retina/large displays expose compression and scaling blur.

No PNG/high-DPI implementation was made. The last statement about replacing the image described intended work, not a completed change.

Recommended next work:

1. Measure the real Daytona display and screenshot options during preflight.
2. Prefer lossless PNG or a measured higher-quality format for text-heavy screens.
3. Avoid enlarging a low-resolution raster beyond useful native dimensions.
4. If local high-DPI rendering is added, explicitly carry screenshot pixel ratio/logical screen dimensions through capture, frame and viewer contracts.
5. Re-test first-click replay and small controls at full/half size, including old captures.

**Do not simply change local deviceScaleFactor to 2.** Current mapping uses naturalWidth/Height as input coordinates while the local browser mouse uses 1024×768 CSS pixels. A 2× screenshot without coordinate conversion breaks clicks. Likewise, serving new 2× live frames after an old 1× still must not mis-map the first replayed click.

## 9. Detective status

`LLM_API_KEY` configures a real OpenAI-compatible client; OPENAI_API_KEY is a fallback. LLM_BASE_URL=stub forces STUB even when a key exists. Set the real base URL and truthful provider label before testing the new keys.

Stub executes four commands against its own actual copy: logs, current state, checkout request, and source grep for the returned error. Its report is assembled from runtime outputs; root cause explicitly says `stub run: no model was used`. It does not claim a diagnosis.

The loop supports tool calls and JSON fallback, an eight-turn limit, a forced final report, per-turn/total limits, 20-second command budgets and bounded output. Evidence must reference an actual command step and quote a substring after whitespace normalization. Whitespace-only evidence is rejected. Invalid evidence is retried, then dropped with a visible note if still invalid.

Real model quality, current Nosana models, tool support, JSON fallback against a real provider, vision support and latency remain unverified. Select a model from the provider's live list; do not hard-code a stale name.

## 10. Daytona implementation and unfinished review

These five files retain their UNTESTED headers: `lib/machine/daytona.ts`, `lib/machine/provision.ts`, `scripts/preflight.ts`, `scripts/setup-golden.ts`, `scripts/cleanup.ts`.

Written modes: VM fork; hot memory snapshot via REST; saved-state rehydration on a fresh container. Driver caches sandbox objects and serializes access. Display/browser/format/dimensions come from preflight or explicit settings rather than runtime guesses.

A separate high-reasoning review agent was used; it was **not Opus**. It found substantive preflight/provisioning gaps and applied changes, then hit its usage limit before writing its final report. Its edits exist and passed a subsequent TypeScript check, but its final independent review was not completed. Do not treat that review as a passed live check.

Applied review changes visible in current source:

- Separate `profiles.vm` and `profiles.container` measurements; fallback actually creates/probes a container and tests a restored second container.
- `modeVerified` in preflight; a failed/unmeasured fallback is not presented as a successful mode.
- Runtime/Node/npm and browser checks/installations repeated on newly provisioned machines, not just the disposable preflight machine.
- SDK create timeout explicitly 120 seconds; ambiguous timeout allocations reconciled by ID/name for cleanup.
- Labelled fork helper cleans up failed label assignment.
- Inherited windows/screenshots verified instead of blindly restarting a desktop after any screenshot failure.
- UI failure verification and semantic copy isolation strengthened; screenshot similarity replaces exact compressed-byte equality.
- Hot snapshot polling tolerates initial 404s and writes pending-name markers under `.data/snapshots` for cleanup.
- Cleanup tolerates already-missing resources and considers pending snapshot markers.
- Input calls await the SDK transport deadline rather than releasing their queue slot on a shorter outer race.

Still review/test these changes with real credentials. `requestTimeoutMs`, timeout after remote allocation, snapshot state/404 behavior, window titles, browser flags and child-before-parent deletion are all live-risk areas. Preflight's nominal ten-minute budget checks before steps; long steps and cleanup can extend wall time.

### Installed SDK differences/additions

`SDK_DIFFERENCES.md` documents the initial comparison, but predates the later review additions. Preserve these facts:

- takeFullScreen returns ScreenshotResponse, not raw base64; screenshot payload is optional.
- displays array and width/height fields are optional.
- getUserHomeDir may return undefined; Sandbox.state is optional.
- ScreenshotOptions.format accepts an unconstrained string in types; actual accepted formats require testing.
- snapshot.delete is used for resource cleanup though omitted from the original plan's examples.
- Later code also uses display.getWindows, DaytonaTimeoutError.sandboxId, DaytonaConnectionError, constructor requestTimeoutMs and create(params, {timeout:120}). Check their installed declarations and add them to SDK_DIFFERENCES.md.
- Preflight imports sharp for screenshot similarity. It is currently available via the installed dependency tree but not explicitly listed in package.json; consider declaring it directly for reproducibility.

## 11. Verification evidence and limits

| Check | Result / qualification |
|---|---|
| Real Chromium install | Passed; no fixed-image fallback |
| Image-only bug reproduction | Passed in browser |
| Capture/link/still | Passed; warmed local still around 196–269 ms, not an external-network SLA |
| First click and successful copy checkout | Passed |
| Independent second tab / unchanged original | Passed |
| Quantity targeting at displayed widths 512 and 1024 | Passed |
| Same-tab reload / immutable still | Passed |
| STUB commands, evidence links and report | Passed |
| Invalid/whitespace evidence and turn-limit final | Passed |
| Initial frame failure → STILL/Retry → LIVE | Passed |
| Saved banner across restart/copy/reload/recovery | Passed |
| Production app through public tunnel | Clicking to LIVE passed in automated browser; user reported earlier development-mode failure |
| Physical second device | User was asked to test; no successful result received yet |
| Mobile layout | Earlier run passed at 390 px. Latest full run hit a test race checking LOCAL MODE before metadata arrived; harness now waits, but full updated run was not repeated |
| TypeScript / production build | Passed previously; handoff rechecks listed below |
| Daytona / real inference | Never run in this work |

Artifacts:

- `QA_REPORT.md`: historical acceptance report; some text predates the saved-banner fix/public failure. This handoff is the newer status.
- `.data/qa/`: screenshots and browser-results.json; the latest JSON includes the mobile assertion failure, not an all-pass run.
- `RECORDING.md`, `.data/demo-recording/liveshot-demo.mp4`: a 64-second real-browser walkthrough, two tabs joined with captions, silent. It predates the banner fix and public dead-click discovery; it is not evidence for cloud copying or current image quality.
- `scripts/browser-qa.ts`, `fault-qa.ts`, `test-agent.ts`, `test-saved-error.ts`, `test-tunnel.ts`, `debug-public.ts`: retained tests/debug tools.

`browser-qa.ts` assumes an empty tester cart. Use an isolated fresh data directory when repeating it. `fault-qa.ts` uses an existing capture. `test-tunnel.ts` was not successfully completed in the interrupted run; its interstitial timing should be checked rather than counted as a pass.

## 12. Credentialed continuation: recommended order

1. Read this handoff, the full plan, contracts, AGENTS.md and relevant installed Next docs. Inspect git status. Do not rebuild from scratch.
2. Configure `.env.local` with the Daytona and inference keys privately. Confirm which sponsor each inference endpoint belongs to; do not guess from the existence of a key.
3. Set `LLM_BASE_URL=https://inference.nosana.com/v1`, `LLM_PROVIDER_LABEL=Nosana`, and remove the forced stub setting when using Nosana. Leave LLM_VISION=0 until tested.
4. Obtain the live model list; choose LLM_MODEL from it. Use the single curl below with environment loaded.
5. Run `npm run preflight`; inspect `.data/preflight.json`, saved pictures and cleanup result. Require modeVerified=true. Fix failures before claiming success.
6. Set LIVESHOT_MODE and AGENT_PROTOCOL from verified results. Preserve PREWARM=1 for rehydrate; adjust quota/FORK_SOURCE based on actual account capacity.
7. Run `npm run setup-golden -- --reuse`; inspect `.data/golden.png` or `.jpg`, not just process success.
8. Finish the image-quality issue with measured dimensions and coordinate-safe changes.
9. Rebuild current source and start production on port 4000; restart after environment changes. Keep local and cloud persisted stores separate.
10. Start ngrok, verify the actual public browser (not curl alone), send a new capture link to the user and obtain a second-device result.
11. Run the real sponsor flow end to end: failure → capture → exact first-click replay → private recovery → independent second viewer → real-model Detective/evidence → split view.
12. Rehearse and record again with truthful mode/provider labels. Cleanup cloud resources only after the demo/test is finished; cleanup removes all app=liveshot resources in the account scope.

### Commands

From this app directory, after editing `.env.local`:

```sh
# One command to fetch current models without printing the key:
bash -c 'set -a; source .env.local; set +a; curl --fail -sS -H "Authorization: Bearer $LLM_API_KEY" "$LLM_BASE_URL/models"'

npm run preflight
# Read .data/preflight.json, then edit LIVESHOT_MODE / AGENT_PROTOCOL / LLM_MODEL.
npm run setup-golden -- --reuse

# After stopping any listener on port 4000:
LIVESHOT_DIST_DIR=.next-build npm run build
LIVESHOT_DIST_DIR=.next-build npm run start

# Separate terminal:
ngrok http http://localhost:4000 --log stdout

# Separate terminal, against the running app:
npm run smoke
npm run test:agent
npx tsc --noEmit

# Local-only saved-banner check; uses its own driver/runtime:
npx tsx scripts/test-saved-error.ts

# Cloud cleanup when finished:
npm run cleanup
```

Use `LIVESHOT_DATA_DIR=.data/cloud` consistently for preflight, setup, server and cleanup if separating cloud data from the existing local data. Merely changing LIVESHOT_MODE does not migrate captures. Existing local captures cannot be spawned by the Daytona driver.

The older RUNBOOK.md still recommends dev serving for its demo step and a cloudflared command. For public sharing, use the production/ngrok sequence above instead.

## 13. Constraints for the next engineer

- Keep P0 share/click/isolation reliable before adding features.
- Do not claim that the unfinished resolution improvement is done.
- Do not mistake an old build or recording for current-source/cloud validation.
- Keep Detective free of DEMO_NOTES and explanatory bug fixtures.
- Keep keys and cloud handles server-side; never put them in this report or browser responses.
- No accounts/auth, durable database, arbitrary-app upload, patch generation or issue filing were built.
- Original user requested minimal token use during continuation. Prefer focused inspection, clear pass/fail evidence and short updates.

## 14. Checks rerun while writing this handoff

- `npx tsc --noEmit`: PASS against the current source, including the review agent's cloud changes and debug scripts.
- `npm run test:agent`: PASS (standard commands, invalid-evidence retry, eight-turn forced final and JSON parser).
- Runtime probes: port 4000 application and port 4040 ngrok admin endpoint were unreachable. No cloud requests were attempted.
