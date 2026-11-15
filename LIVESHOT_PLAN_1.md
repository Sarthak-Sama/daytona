# LIVESHOT: MVP build plan

Audience: an AI coding agent (or a developer) building this from scratch. Read the whole
document before writing code. Everything you need to know about the project is here.

Status markers used throughout:

- **[CONFIRMED]** seen in the official docs or in the published SDK type definitions
  (`@daytona/sdk` 0.231.1, read on 2026-11-15). Not yet run against a live account.
- **[VERIFY]** not documented or not confirmed. The preflight script (section 6) settles
  each of these. Do not build on a [VERIFY] item before preflight has passed it.

---

## 1. What we are building and why

**LIVESHOT turns a screenshot into a clickable copy of the machine it was taken on.**

A tester hits a bug in a web app and presses "Capture LIVESHOT". They get a link. Whoever
opens the link sees what looks like an ordinary screenshot. When they click on it, it
responds: it is a private copy of the tester's machine, frozen at the moment of capture,
with the app, the browser and all in-memory state intact. Every viewer gets their own
copy. An AI agent can take a copy too, investigate the bug inside it, and report back
with evidence it gathered by running real commands.

The one reaction we are building for: **"Wait, you can actually click inside that
screenshot?"** Everything in this plan is ordered to protect that moment.

### Hackathon constraints

- Event: Daytona HackSprint Tokyo, 2026-11-15. Hacking 15:00 to 16:15 (75 minutes).
  Demos from 16:30, 3 minutes per team. Roughly 30 to 40 teams.
- Judging: completeness (a working MVP), innovation, real-life problem solving, sponsor
  product usage.
- Sponsors: **Daytona** (cloud sandboxes; we use VM fork, Computer Use, process exec) and
  **Nosana** (GPU network; we use its OpenAI-compatible LLM inference).
- Whether code written before 15:00 is allowed is unknown. This plan works either way:
  the phases in section 12 are the same, only the clock changes.

### What already exists

`shop/` is a finished demo target: a small Express + React checkout app with one planted
bug. Read `shop/CONTRACT.md` and the repo README for exact routes. Key facts:

- Start: `cd shop && npm ci --omit=dev && node server.js`. Listens on `0.0.0.0:3000`. The
  frontend is prebuilt in `shop/dist`. No build step.
- All state is one global in-memory session on the server. No cookies, no localStorage.
- Bug: add item, apply coupon `WELCOME10`, change a quantity, press Pay. The server
  returns 500 every time. Removing the coupon makes Pay succeed.
- Evidence: JSON-lines log at `shop/logs/app.log`; `GET /api/debug/state`;
  `POST /api/debug/reset`; `GET /health`.
- `PERSIST_STATE=1` makes the server save its session to `shop/data/state.json` and load
  it on start (used by fallback Mode C).
- Designed for a 1024x768 screen with large click targets.
- `DEMO_NOTES.md` at the repo root explains the bug. **Never upload it to a sandbox and
  never show it to the AI agent.** Only `shop/` goes to the sandbox.

Do not modify `shop/` unless a step here says so.

---

## 2. Scope

### In (P0, the demo fails without these)

1. A "golden" Daytona Linux VM running the shop and a kiosk browser on its desktop.
2. Tester console: a page that shows the golden machine's screen, forwards clicks and
   keys to it, and has a **Capture LIVESHOT** button.
3. Capture: stores a still image, logs and state, freezes a copy of the machine, returns
   a share link.
4. Share page `/s/[captureId]`: loads the still instantly. Clicking it (or pressing
   Interact) gives this viewer a private live copy and the image becomes interactive.
5. Each browser tab gets its own independent copy.

### In (P1, the sponsor story and the second half of the demo)

6. AI Detective: a Nosana-hosted model investigates the bug in its own copy using shell
   commands, and produces a structured report whose evidence comes from commands it ran.
7. Copies panel: lists the copies made from a capture (you, another viewer, AI).
8. Split view: the original still next to a live human copy and the AI's transcript.

### Out (do not build)

Auth and accounts, a database, live video or VNC embedding, GitHub issue creation,
browser extension, automatic crash capture, multi-user cursors, AI-written patches,
arbitrary user apps. One line each in the pitch is enough for these.

### Stretch (only if everything above is rehearsed and stable)

- "Open full desktop" link to the sandbox's noVNC page in a new tab. [VERIFY port/path]
- AI applies the fix in its copy and re-runs the failing request.

---

## 3. Architecture

```
 Viewer browser (laptop / judge's phone)
        |  HTTPS: only talks to our app, never to Daytona or Nosana
        v
 LIVESHOT web app  (Next.js, one long-lived Node process on the presenter's laptop)
   - pages: tester console, share page, split view
   - API routes: frames, input, capture, sessions, investigation
   - in-memory store + JSON file on disk
   - MachineDriver  ----------------------->  Daytona API  (@daytona/sdk)
   - Detective agent loop  ----------------->  Nosana inference (OpenAI-compatible)
                                              and Daytona process exec in the AI's copy

 Daytona (all Linux VM class sandboxes)
   golden VM ──fork──> capture VM (frozen moment, nobody touches it)
                          ├─fork──> session VM (viewer 1)
                          ├─fork──> session VM (viewer 2)
                          └─fork──> session VM (AI Detective)
   each VM: shop server on :3000 + kiosk browser on the desktop
```

Key decisions and the reason for each:

- **One Next.js app, run locally with `next start` (or `next dev`).** Not serverless: the
  agent loop and the in-memory store need a long-lived process. To let a second device
  open the link, expose the laptop with a tunnel (`cloudflared tunnel --url
  http://localhost:4000`). Run LIVESHOT on port **4000**; port 3000 is the shop's port
  inside sandboxes and using it locally too causes confusion.
- **The viewer is screenshot-and-click, not video.** A still image that updates after
  each input is exactly the product idea, needs no streaming infrastructure, and uses
  only confirmed APIs.
- **The tester uses the same viewer component, pointed at the golden VM.** The bug state
  must exist inside the VM's own browser, so the tester has to drive that browser. This
  also means one component serves all three roles.
- **Capture creates an intermediate frozen copy** (the capture VM). Sessions fork from
  it, not from the golden VM, so the captured moment stays fixed even if the tester
  keeps clicking.
- **A `MachineDriver` interface hides how copies are made**, because that is the part
  most likely to need a fallback (section 5).
- **Secrets stay server-side.** The browser only ever sees our own session ids.

---

## 4. Tech stack

| Piece | Choice |
|---|---|
| Web app | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Daytona SDK | `@daytona/sdk` (the name the docs use; `@daytonaio/sdk` is the older name and is still published at the same version) [CONFIRMED] |
| LLM client | `openai` npm package with a custom `baseURL` |
| IDs | `nanoid` |
| Scripts | `tsx` to run TypeScript scripts directly |
| Validation | `zod` for the agent's report |
| Store | in-memory `Map`s on `globalThis`, mirrored to `.data/store.json` |

Next.js notes: every API route needs `export const runtime = 'nodejs'` and
`export const dynamic = 'force-dynamic'`. If the Daytona SDK fails to bundle, add it to
`serverExternalPackages` in `next.config`. Keep the store on `globalThis` so dev-mode hot
reload does not wipe it.

### Environment variables (`.env.local`)

```
DAYTONA_API_KEY=            # required
DAYTONA_API_URL=            # optional, default https://app.daytona.io/api
DAYTONA_TARGET=us           # region; prefer us (open reports of VM flakiness in eu)
DAYTONA_VM_SNAPSHOT=daytona-vm-medium   # 2 vCPU / 4 GiB / 8 GiB
LIVESHOT_MODE=fork          # fork | hot-snapshot | rehydrate | mock   (set by preflight)
FORK_SOURCE=capture         # capture | golden   (see section 5)
PREWARM=1                   # keep one ready copy per capture
MAX_LIVE_SESSIONS=3         # quota guard, see section 5

LLM_BASE_URL=https://inference.nosana.com/v1
LLM_API_KEY=                # Nosana key, starts with nos_
LLM_MODEL=                  # empty = pick from /v1/models at startup
LLM_PROVIDER_LABEL=Nosana   # shown in the UI; must be truthful
LLM_VISION=0                # 1 only if preflight proves image input works
```

---

## 5. How a machine gets copied (modes)

`LIVESHOT_MODE` selects one of four driver behaviours. Preflight picks the mode.

### Mode A, `fork` (the intended path)

- Capture: `golden.fork({ name })` produces the capture VM.
- Session: `captureVm.fork({ name })` produces a session VM.
- Docs state a fork copies filesystem **and memory**, running processes continue, and a
  fork can itself be forked. [CONFIRMED in docs; VERIFY on our account, including that
  the browser window and Computer Use still work in the fork]
- Fork duration and limits are undocumented. [VERIFY]

### Mode B, `hot-snapshot`

- Capture: a memory snapshot of the golden VM through the REST API (the SDK's
  `createSnapshot` is filesystem-only). [CONFIRMED]
- Session: `daytona.create({ snapshot: name })`; processes come back running.
- Use if fork fails but memory snapshots work. Timing undocumented. [VERIFY]

### Mode C, `rehydrate` (works on any account, no VM class needed)

- Golden runs on a normal container sandbox with the shop started as `PERSIST_STATE=1`.
- Capture: take the still, download `shop/data/state.json` and the logs.
- Session: create a fresh container sandbox, upload the shop and that `state.json`, start
  the shop with `PERSIST_STATE=1`, start the desktop, open the browser on the checkout
  page. Takes tens of seconds, so `PREWARM=1` is mandatory.
- Limitation: the server state is restored but the browser page is fresh, so a visible
  error banner may be gone until Pay is pressed again. **In this mode the pitch must say
  "restored state" and must not claim a memory copy.**

### Mode `mock` (for building the UI without credentials)

- Screenshot returns a fixed image from `public/mock/`. Input is logged and ignored.
  Spawn waits 1.5 s. Exec returns canned output. Lets the frontend be built in parallel.

### Quota guard

Tier 1 accounts allow about 10 vCPU in total [CONFIRMED in docs]. With 2-vCPU VMs that is
5 machines: golden + capture + 3 sessions. Therefore:

- `MAX_LIVE_SESSIONS=3`. When a new session would exceed it, delete the oldest idle
  session first (never one with an investigation running).
- If preflight shows the quota is tighter, set `FORK_SOURCE=golden`: sessions fork
  directly from the golden VM, and capture marks the golden VM **locked** (the tester
  console rejects input and shows "Captured: this machine is frozen"). That saves one
  machine.
- If `daytona-vm-small` (1 vCPU / 1 GiB) turns out to run the desktop and browser
  acceptably, switching to it doubles the headroom. [VERIFY]
- Deleting: a parent cannot be deleted while it has fork children [CONFIRMED]. Always
  delete sessions, then capture VMs, then golden.

### Keeping machines alive

VMs auto-pause after 60 idle minutes by default [CONFIRMED]. Create with
`autoPauseInterval: 0, autoStopInterval: 0` [VERIFY that both zero is accepted; if the
create call rejects it, pass only `autoPauseInterval: 0`]. **Never call `stop()` on a VM
whose memory matters: stop clears memory.** [CONFIRMED]

---

## 6. Preflight: run this before building anything else

`scripts/preflight.ts` is a go/no-go test. It prints PASS/FAIL and timings for each step,
saves screenshots to `.data/preflight/`, and ends with a recommended `LIVESHOT_MODE`.
Budget: 10 minutes. A free Daytona account is enough to run it, so run it as early as
credentials exist.

| # | Step | Pass means |
|---|---|---|
| 1 | Create a VM: `daytona.create({ snapshot: DAYTONA_VM_SNAPSHOT, autoPauseInterval: 0, autoStopInterval: 0, labels })`. Record seconds. | VM class is available to us |
| 2 | Exec: `whoami; node -v; npm -v; sudo -n true && echo SUDO_OK; echo $SHELL` | Node exists (else install it), we know the user |
| 3 | `computerUse.start()`, wait 2 s, `display.getInfo()`. Record resolution. | Desktop runs on the VM image |
| 4 | Exec: `ls /tmp/.X11-unix; ps aux \| grep -E "Xvfb\|x11vnc\|novnc\|websockify" \| grep -v grep; ss -ltnp` | We know the DISPLAY number and the noVNC port |
| 5 | Exec: `which chromium chromium-browser google-chrome google-chrome-stable firefox firefox-esr` | We know the browser binary (else `sudo apt-get install -y chromium`) |
| 6 | Screenshot: try `takeCompressed({ format: 'jpeg', quality: 70 })`; on error try `'jpg'`, then `'png'`, then `takeFullScreen()`. Record ms and bytes for each that works. | We know the working format and the latency |
| 7 | Upload and start the shop (section 7 steps), launch the kiosk browser, screenshot. | Shop is visible on the VM screen |
| 8 | Put the shop in the failing state by real clicks and typing through Computer Use (coordinates found from the screenshot), screenshot A. | Input works end to end |
| 9 | `fork()`. Record seconds. In the fork: `curl -s localhost:3000/api/debug/state` equals the parent's; screenshot B looks the same as A; click a quantity button and screenshot C differs from B; parent's state is unchanged. | **Mode A works** |
| 10 | Fork the fork. Same checks. | Capture-then-session chain works |
| 11 | Create forks until one fails or 4 exist. Record the count. | We know the real quota |
| 12 | Only if 9 failed: hot snapshot via REST, create from it, same checks. Record seconds. | Mode B works |
| 13 | Nosana: `GET /v1/models`; one chat completion with a `run_shell` tool; record whether `tool_calls` came back and the latency. Optionally one request with an image. | We know the model id and whether tool calling works |
| 14 | Delete everything created (children first). | Clean quota |

Decision:

- 9 and 10 pass: `LIVESHOT_MODE=fork`.
- 9 fails, 12 passes: `hot-snapshot`.
- 1 fails, or both 9 and 12 fail: `rehydrate`, and tell the user immediately because the
  pitch wording changes.
- 13 fails for tool calling: set `AGENT_PROTOCOL=json` (section 10). If no model is live
  at all, start a self-hosted deployment right away (section 10) because cold start can
  take 5 to 15 minutes.

Write the measured values (DISPLAY, browser binary, screenshot format, resolution, fork
seconds, model id) into `.data/preflight.json`. The driver reads them from there instead
of hard-coding guesses.

---

## 7. Daytona usage: confirmed signatures

```ts
import { Daytona } from '@daytona/sdk';
const daytona = new Daytona();   // reads DAYTONA_API_KEY, DAYTONA_API_URL, DAYTONA_TARGET

// create a Linux VM (the snapshot name selects the class; there is no class param)
const sb = await daytona.create({
  snapshot: 'daytona-vm-medium',
  autoPauseInterval: 0, autoStopInterval: 0,          // [VERIFY both zero]
  labels: { app: 'liveshot', role: 'golden' },
});

// lookup, list, delete
const again = await daytona.get(idOrName);
for await (const s of daytona.list({ labels: { app: 'liveshot' } })) { /* ... */ }
await sb.delete(60, true);                           // wait = true

// fork (VM class only; a container sandbox returns 422)
const child = await sb.fork({ name: 'ls-cap-abc123' }, 120);   // timeout seconds
await child.setLabels({ app: 'liveshot', role: 'capture', captureId: 'abc123' });

// commands
const r = await sb.process.executeCommand(cmd, cwd, env, timeoutSeconds);
r.exitCode; r.result;                                // stdout is in .result
// long-running process: always redirect output and background it
await sb.process.executeCommand('cd ~/shop && nohup node server.js > /tmp/shop.log 2>&1 &');

// files
await sb.fs.uploadFile(localPathOrBuffer, remotePath);
const buf = await sb.fs.downloadFile(remotePath);    // Buffer
const home = await sb.getUserHomeDir();

// desktop
await sb.computerUse.start();                        // Xvfb, xfce4, x11vnc, novnc
const shot = await sb.computerUse.screenshot.takeCompressed({ format, quality: 70, showCursor: true });
shot.screenshot;                                     // base64 string
await sb.computerUse.screenshot.takeFullScreen(true);          // base64 PNG
await sb.computerUse.mouse.click(x, y);              // real screen pixels, left button
await sb.computerUse.mouse.click(x, y, 'left', true);          // double click
await sb.computerUse.mouse.scroll(x, y, 'down', 3);
await sb.computerUse.keyboard.type('WELCOME10');
await sb.computerUse.keyboard.press('enter');        // names are case-insensitive
await sb.computerUse.keyboard.hotkey('ctrl+a');
const info = await sb.computerUse.display.getInfo(); // info.displays[0].width / .height
```

Other confirmed facts:

- There is no directory upload. Tar the folder locally, upload the tarball, extract it
  with `executeCommand`.
- Screen resolution on VM sandboxes is fixed and cannot be configured. On container
  sandboxes it is set at creation with `envVars: { VNC_RESOLUTION: '1024x768' }` (needed
  in Mode C). Default is 1024x768.
- `executeCommand` timeout is in seconds and the docs give a 10 s default. Pass an
  explicit timeout for anything slow (`npm ci`: 180).
- A hot (memory) snapshot is REST only:
  `POST {apiUrl}/sandbox/{id}/snapshot` with `Authorization: Bearer <key>` and body
  `{"name": "...", "includeMemory": true}`; the VM must be started. The docs also show an
  `X-Daytona-Organization-ID` header; send it if the call is rejected without it. Then poll
  `daytona.snapshot.get(name)` until its state is `active`. [VERIFY response and timing]
- Tier 1 and 2 accounts have restricted outbound network. The npm registry and
  Debian/Ubuntu package mirrors are reachable. Other hosts may not be. [VERIFY if needed]

### Setting up a machine (golden VM, and every Mode C session)

`lib/machine/provision.ts`, used by `scripts/setup-golden.ts`:

1. Create the sandbox (VM in modes A and B, container with `VNC_RESOLUTION` in mode C).
2. `home = await sb.getUserHomeDir()`.
3. Locally: `tar czf .data/shop.tgz --exclude=node_modules --exclude=logs --exclude=data
   -C <repo> shop`. Upload to `${home}/shop.tgz`. Exec `tar xzf shop.tgz` in `home`.
   Check that `DEMO_NOTES.md` is not inside the tarball.
4. Exec `cd ${home}/shop && npm ci --omit=dev` (timeout 180).
5. Start the shop in the background with output redirected. In Mode C prefix
   `PERSIST_STATE=1`.
6. Poll `curl -s -o /dev/null -w "%{http_code}" localhost:3000/health` until `200`
   (up to 30 s).
7. `computerUse.start()`, wait 2 s.
8. Launch the browser in kiosk mode with `DISPLAY` from preflight:

   ```
   nohup <browser> --kiosk --no-first-run --no-default-browser-check \
     --disable-infobars --disable-session-crashed-bubble --disable-translate \
     --password-store=basic --user-data-dir=/tmp/ls-profile \
     http://localhost:3000 > /tmp/browser.log 2>&1 &
   ```

   Add `--no-sandbox` only if the browser refuses to start as the current user. For
   Firefox use `firefox --kiosk http://localhost:3000`. [VERIFY flags on the real image]
9. Wait 4 s, take a screenshot, save it to `.data/golden.png` and print the path so a
   human can confirm the shop fills the screen with no browser chrome or dialogs.
10. Save `{ sandboxId }` to `.data/golden.json`.

Kiosk mode matters: with no address bar or desktop visible, the capture looks like a
screenshot of an app, and the reveal works.

`scripts/setup-golden.ts --reuse` skips creation if `.data/golden.json` points to a
sandbox that is still started. `scripts/cleanup.ts` deletes every sandbox labelled
`app=liveshot`, children before parents.

---

## 8. Backend

### Data model (`lib/types.ts`)

```ts
type Mode = 'fork' | 'hot-snapshot' | 'rehydrate' | 'mock';

interface Capture {
  id: string;                 // nanoid(10), also the share-link token
  createdAt: number;
  mode: Mode;
  stillPath: string;          // .data/captures/<id>.jpg
  width: number; height: number;
  sourceRef: string;          // capture VM id | snapshot name | path to state.json
  logsTail: string;           // last 200 lines of shop/logs/app.log at capture time
  debugState: unknown;        // GET /api/debug/state at capture time
  note?: string;              // optional tester note ("checkout isn't working")
}

interface Session {
  id: string;                 // nanoid(16); secret, grants control of one copy
  captureId: string | null;   // null for the tester's session on the golden VM
  kind: 'tester' | 'human' | 'ai';
  label: string;              // "You", "Copy 2", "AI Detective"
  sandboxId: string;
  status: 'starting' | 'ready' | 'error' | 'closed';
  error?: string;
  createdAt: number; lastInputAt: number;
}

interface Investigation {
  id: string; captureId: string; sessionId: string;
  status: 'starting' | 'running' | 'done' | 'error';
  model: string; provider: string;
  steps: AgentStep[];         // appended live; the UI polls this
  report?: BugReport;
  error?: string;
}

interface AgentStep {
  n: number;
  kind: 'thought' | 'command' | 'report';
  text?: string;              // model's short reasoning, if any
  command?: string; exitCode?: number; output?: string;   // output truncated to 4000 chars
  ms?: number;
}

interface BugReport {
  title: string;
  observedError: string;
  reproSteps: string[];
  rootCause: string;
  evidence: { step: number; excerpt: string }[];   // step = AgentStep.n of a command
  suggestedFix: string;
  confidence: number;         // 0..1
  uncertainty: string;
}
```

### Driver (`lib/machine/driver.ts`)

```ts
interface MachineDriver {
  mode: Mode;
  capture(goldenSandboxId: string, captureId: string): Promise<{ sourceRef: string }>;
  spawn(capture: Capture, name: string): Promise<{ sandboxId: string }>;
  screenshot(sandboxId: string): Promise<{ base64: string; mime: string }>;
  input(sandboxId: string, ev: InputEvent): Promise<void>;
  exec(sandboxId: string, command: string, opts?: { cwd?: string; timeoutSec?: number }):
    Promise<{ exitCode: number; output: string }>;
  destroy(sandboxId: string): Promise<void>;
}

type InputEvent =
  | { type: 'click'; x: number; y: number; button?: 'left' | 'right'; double?: boolean }
  | { type: 'type'; text: string }
  | { type: 'key'; key: string; modifiers?: string[] }
  | { type: 'scroll'; x: number; y: number; direction: 'up' | 'down'; amount?: number };
```

Implementation rules:

- Cache `Sandbox` objects in a `Map<sandboxId, Sandbox>`; fetch with `daytona.get` once.
- **Serialise calls per sandbox** with a promise chain (`Map<sandboxId, Promise>`), so a
  click and a screenshot never interleave out of order.
- Round and clamp coordinates to the screen size before sending.
- Wrap every Daytona call in a timeout and one retry for network errors. Never retry a
  click or keystroke that may have landed; retry only screenshots and reads.
- `spawn` in fork mode: `source.fork({ name }, 120)`, then `setLabels`. Do not call
  `computerUse.start()` in a fork unless a screenshot fails: restarting the desktop
  would kill the browser we are trying to preserve. [VERIFY in preflight step 9]

### API routes (`app/api/...`)

All responses are JSON. All errors are `{ error: string }` with a 4xx/5xx status.

| Route | Does |
|---|---|
| `GET /api/golden` | Returns `{ sessionId, locked }` for the tester session on the golden VM (creates the Session record on first call). |
| `GET /api/sessions/[id]` | `{ status, kind, label, error }`. The client polls this while `starting`. |
| `GET /api/sessions/[id]/frame` | Takes a screenshot. `{ image: base64, mime, ts }`. 409 if not ready. |
| `POST /api/sessions/[id]/input` | Body: `InputEvent`. Performs it, waits 350 ms, screenshots, returns the same shape as `/frame`. Rejects if the session is the tester's and the golden VM is locked. |
| `DELETE /api/sessions/[id]` | Destroys that copy. |
| `POST /api/captures` | Body `{ note? }`. Runs the capture flow below. Returns `{ id, url }`. |
| `GET /api/captures/[id]` | Metadata (no secrets, no sandbox ids), plus `sessions: [{ label, kind, status }]` and the latest investigation id. |
| `GET /api/captures/[id]/still` | The stored still image, `Cache-Control: public, max-age=31536000, immutable`. |
| `POST /api/captures/[id]/sessions` | Creates a human session (uses the prewarmed copy if there is one, else spawns). Returns `{ sessionId }` immediately with status `starting`; spawning continues in the background. |
| `POST /api/captures/[id]/investigate` | Creates an AI session and starts the agent loop in the background. Returns `{ investigationId }`. If one is already running for this capture, returns it. |
| `GET /api/investigations/[id]` | The `Investigation` record. The client polls every second. |

### Capture flow (`POST /api/captures`)

1. Screenshot the golden VM. This is the still. Save it and record its pixel size.
2. Exec on golden: `tail -n 200 ~/shop/logs/app.log` and
   `curl -s localhost:3000/api/debug/state`.
3. `driver.capture(...)`: fork (A), hot snapshot (B), or download `state.json` (C).
4. If `FORK_SOURCE=golden`, mark the golden VM locked instead of step 3.
5. Save the `Capture`, persist the store, respond with the link.
6. If `PREWARM=1`, spawn one human session in the background and hold it in a
   `prewarmed: Map<captureId, sessionId>`. When it is claimed, start spawning the next
   one if the quota allows.

Take the still **before** forking so the image and the frozen machine are the same
moment.

### Store (`lib/store.ts`)

`Map`s for captures, sessions and investigations on `globalThis.__liveshot`. Save to
`.data/store.json` after every mutation (debounced 200 ms) and load on startup. On load,
mark any session whose sandbox no longer exists as `closed`.

---

## 9. Frontend

### Pages

| Path | Purpose |
|---|---|
| `/` | Tester console. The live golden machine in the viewer, an optional note field, and a large **Capture LIVESHOT** button. After capture: the link, a copy button and a QR code. |
| `/s/[id]` | The share page. This is the product. |
| `/s/[id]/split` | Final-reveal view: original still, a live human copy, the AI transcript. |

### The `LiveshotViewer` component (the core)

Props: `{ stillUrl?: string; sessionId?: string; interactive: boolean; onFirstClick?: (pt) => void }`.

Rendering: one `<img>` inside a container that keeps the still's aspect ratio. Frames
arrive as base64; set `img.src = 'data:<mime>;base64,...'`. Preload each new frame in an
off-screen `Image` and swap on `onload` so the picture never flashes blank.

Coordinate mapping (do this exactly):

```ts
const rect = img.getBoundingClientRect();
const x = Math.round((e.clientX - rect.left) * (img.naturalWidth  / rect.width));
const y = Math.round((e.clientY - rect.top)  * (img.naturalHeight / rect.height));
```

`naturalWidth/Height` of a full-screen screenshot is the remote screen size, so no
separate size lookup is needed. Use `pointerdown` so it works on touch screens.

Input handling:

- **Click:** draw a ripple at the click point immediately, send `click`, replace the
  image with the returned frame. Then fetch `/frame` again at +700 ms and +1500 ms to
  catch anything that settled late.
- **Typing:** the container is focusable (`tabIndex=0`). Buffer printable characters for
  150 ms and send one `type` event. Send special keys as `key` events using this map:
  `Enter→enter`, `Backspace→backspace`, `Tab→tab`, `Escape→escape`, `Delete→delete`,
  `ArrowUp→up`, `ArrowDown→down`, `ArrowLeft→left`, `ArrowRight→right`
  [VERIFY arrow names]. `preventDefault` on handled keys.
- **Mobile typing:** a small text field with a Send button under the viewer, shown on
  touch devices. Phones do not raise a keyboard for an image.
- **Scroll:** wheel events, throttled to one `scroll` per 250 ms.
- **Idle refresh:** while interactive and the tab is visible, fetch `/frame` every 2 s.
  Stop when hidden.
- **One request at a time:** queue inputs client-side and drop idle refreshes while an
  input is in flight.
- **Stale frames:** ignore a frame whose `ts` is older than the one displayed.

Feedback: a thin progress line along the top edge while a request is in flight, and a
small latency readout ("412 ms") in the corner. Slowness that is visibly being worked on
reads as "real remote machine"; unexplained slowness reads as broken.

### The share page state machine

```
STILL  ── first click on the image, or the Interact button ──>  WAKING
WAKING ── session status becomes ready, first live frame loaded ──>  LIVE
WAKING ── error ──>  STILL with an error toast and a Retry button
```

- **STILL:** show `GET /api/captures/[id]/still`. This must be on screen in well under a
  second. Badge: "STILL". Below: capture time, the tester's note, a collapsed "captured
  logs" drawer.
- **First click:** remember the click coordinates, `POST .../sessions`, enter WAKING.
- **WAKING:** keep the still on screen (never a spinner replacing it). Overlay a subtle
  sweep animation and the text "Waking this moment up…". Poll the session every 500 ms.
- **LIVE:** fetch the first live frame and cross-fade to it over 150 ms. It should look
  identical to the still: that sameness is the proof. Then **replay the remembered first
  click** so the user's click on the "picture" takes effect. Badge flips to a pulsing
  "LIVE · your private copy".
- Store `sessionId` in `sessionStorage` under `liveshot:<captureId>`. A reload in the
  same tab resumes the same copy; a new tab gets a new copy. That difference is the
  "fork the world" demo step, so do not use `localStorage`.

Side panel:

- **Copies:** from `GET /api/captures/[id]`: "You", "Copy 2", "AI Detective", each with a
  status dot. A "New copy" button opens the same URL in a new tab.
- **Ask AI Detective** button, then the investigation panel (section 10).
- "Reset my copy": deletes the session and returns to STILL.

### Visual direction

Make it look designed, not templated. Direction: a photo darkroom. Dark neutral
background; the capture sits in a frame like a print; the STILL to LIVE change is the
one big animated moment (the frame's border lights up, the badge changes, a short
shimmer crosses the image). Everything else is quiet. One accent colour for "live". Large
readable type, since this is shown on a projector. Small Japanese sublabels next to the
two state badges (静止画 for STILL, 起動中 for LIVE) suit a Tokyo audience; keep them
secondary to the English.

Do not put decoration on top of the screenshot itself. Its pixels must stay exact.

---

## 10. AI Detective

### Inference: Nosana

Primary: Nosana's hosted, pay-per-token API. [CONFIRMED in docs]

- Base URL `https://inference.nosana.com/v1`, header `Authorization: Bearer nos_...`.
- Key: deploy.nosana.com → Account → API Keys → Create Key, with the `inference:use`
  permission. Permissions cannot be edited after creation.
- OpenAI-compatible: `GET /v1/models`, `POST /v1/chat/completions`, streaming supported.
- `/v1/models` lists only models being served right now. **Read the model id from that
  list; do not hard-code one.** Prefer a model with a context length of 32k or more.
- Errors: 401 bad key, 402 no credits, 404 model not currently served, 502/504 upstream.
- Reasoning models return thinking in `message.reasoning`, separate from
  `message.content`.
- Tool calling, JSON mode and image input are **not documented** for this API. [VERIFY in
  preflight step 13]

Second choice, if no suitable model is live: deploy one yourself on Nosana (dashboard →
Deploy → an Ollama or vLLM template for a Qwen 27B-class model, 24 GB+ GPU, duration 180
minutes). Poll the deployment until its endpoint reports `online: true`, then set
`LLM_BASE_URL=https://<endpoint>/v1`. Deployment `timeout` is in minutes and must be at
least 60 for credit-paid keys. The endpoint URL changes if the deployment restarts.
Expect 5 to 15 minutes of cold start [estimate], so start it the moment you know you
need it.

Last resort: point `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` at any other
OpenAI-compatible provider and set `LLM_PROVIDER_LABEL` to its real name. The UI shows
that label, so the demo never misstates where inference ran.

```ts
import OpenAI from 'openai';
const llm = new OpenAI({ baseURL: process.env.LLM_BASE_URL, apiKey: process.env.LLM_API_KEY });
const model = process.env.LLM_MODEL || (await llm.models.list()).data[0].id;
```

### The loop (`lib/agent/detective.ts`)

1. Spawn an AI session (a fork of the capture). The agent only ever receives this
   sandbox id. It has no code path to the golden or capture VM.
2. Build the first user message from: the tester's note; the capture time; the last 60
   lines of `logsTail`; `debugState`; the output of
   `cd ~/shop && find . -path ./node_modules -prune -o -type f -print | head -80`; and
   `shop/CONTRACT.md`. If `LLM_VISION=1`, attach the still as an image; otherwise add one
   sentence saying a screenshot exists showing a payment failure.
3. Loop, at most **8 model turns**, 90 s wall-clock cap per turn, 4 minutes total:
   - Call the model with two tools:
     - `run_shell({ command: string })`: executed in `~/shop` in the AI's copy, 20 s
       timeout, output truncated to 4000 characters (keep head and tail). Returned to
       the model as the tool result with the exit code.
     - `submit_report(BugReport)`: ends the loop.
   - Append an `AgentStep` for every command and its output as soon as it finishes, so
     the UI shows progress live.
4. Validate the report with zod. **Every `evidence[].step` must be the number of a
   command step that actually ran, and its `excerpt` must be a substring of that step's
   output** (compare after collapsing whitespace). If validation fails, send the errors
   back to the model once and ask for a corrected report. If it fails again, show the
   report with the invalid evidence items dropped and a visible note saying so.
5. If the turn limit is hit without a report, make one final call with tools disabled
   asking for the report as JSON from what has been gathered.

System prompt (use this, adjust paths if needed):

```
You are a debugging agent investigating a bug report. You have a private, disposable
copy of the exact machine where the bug happened, frozen at the moment the tester
captured it. The web app's source is in the current directory and it is running at
http://localhost:3000 with the tester's session still in memory. Nothing you do affects
the tester or anyone else, so run whatever you need.

Work like an engineer: look at the current state and logs, reproduce the failure with a
real request, read the code on the failing path, form a hypothesis, and confirm it with
a command before you report it. Prefer small, fast commands (curl, tail, grep, sed -n,
cat). Do not restart the server: its memory holds the state you are investigating.

You have 8 turns. Finish by calling submit_report. Every evidence item must cite the
step number of a command you ran and quote a short excerpt of its real output. If you
could not confirm something, say so under uncertainty and lower your confidence. Write
for a developer who has not seen the bug: plain sentences, exact file and function
names.
```

### Fallback protocol (`AGENT_PROTOCOL=json`)

If the model does not return `tool_calls`: no `tools` parameter; the system prompt adds
"Reply with exactly one JSON object and nothing else: `{"action":"run_shell","command":
"..."}` or `{"action":"report","report":{...}}`". Parse leniently: strip code fences and
any `<think>...</think>` block, then take the first balanced `{...}`. On a parse failure,
reply "That was not valid JSON. Send one JSON object." once per turn.

### Investigation panel (UI)

- Header: "AI Detective · running in its own copy · model `<id>` on `<provider>`".
- A terminal-style transcript: each command with a `$` prefix, its output dimmed below,
  exit code and duration on the right. New steps appear as they complete.
- When done, a report card: title, observed error, numbered repro steps, root cause,
  suggested fix, a confidence bar, and remaining uncertainty.
- Each evidence item is a quote with a "from step N" link that scrolls to and highlights
  that command in the transcript. This link is what shows a judge that the evidence came
  from execution and was not generated.

---

## 11. Repo layout

```
/shop                      existing demo target (do not modify)
/DEMO_NOTES.md             bug explanation; never uploaded, never shown to the agent
/liveshot
  .env.local
  app/
    page.tsx                         tester console
    s/[id]/page.tsx                  share page
    s/[id]/split/page.tsx            split view
    api/golden/route.ts
    api/sessions/[id]/route.ts
    api/sessions/[id]/frame/route.ts
    api/sessions/[id]/input/route.ts
    api/captures/route.ts
    api/captures/[id]/route.ts
    api/captures/[id]/still/route.ts
    api/captures/[id]/sessions/route.ts
    api/captures/[id]/investigate/route.ts
    api/investigations/[id]/route.ts
  components/
    LiveshotViewer.tsx  CopiesPanel.tsx  InvestigationPanel.tsx  ReportCard.tsx
    CaptureButton.tsx   StateBadge.tsx
  lib/
    types.ts  store.ts  config.ts
    machine/driver.ts  machine/daytona.ts  machine/mock.ts  machine/provision.ts
    agent/detective.ts  agent/llm.ts  agent/report.ts
  scripts/
    preflight.ts  setup-golden.ts  cleanup.ts  smoke.ts
  .data/                    gitignored: store.json, golden.json, preflight.json, captures/
```

`scripts/smoke.ts` drives the API end to end without a browser: capture, create a
session, click, check the frame changed, start an investigation, wait for a report.

---

## 12. Build order

Work strictly in this order. Each phase ends with something that runs. If a phase is not
working, do not start the next one.

| Phase | Build | Done when | 75-min clock |
|---|---|---|---|
| 0 | Scaffold Next app, types, store, config, mock driver, viewer against mock | Clicking the mock image logs coordinates that match the pixel clicked | before 15:00 if allowed |
| 1 | `preflight.ts` and run it | A mode is chosen and `.data/preflight.json` is written | 15:00–15:10 |
| 2 | `provision.ts`, `setup-golden.ts`, Daytona driver: screenshot, input, exec | The shop is visible in a saved screenshot of the golden VM | 15:10–15:20 |
| 3 | Frame and input routes; tester console on the real golden VM | You can reach the bug state by clicking and typing in the browser | 15:20–15:30 |
| 4 | Capture flow, still route, share page STILL state | A link opens on another device and shows the still instantly | 15:30–15:37 |
| 5 | Session spawn, WAKING→LIVE, first-click replay, prewarm | Clicking the still on a second device changes the app; a second tab is independent | 15:37–15:50 |
| 6 | Detective loop, investigation route and panel | A report appears with evidence linked to real commands | 15:50–16:03 |
| 7 | Copies panel, split view, visual polish | The final-reveal screen works | only if time |
| 8 | Rehearse twice, record a backup video, run nothing new | A clean recording exists | 16:03–16:15 |

Start the Nosana key and model check at 15:00 in parallel with phase 1; it needs no code.

**Cut order when behind:** split view → copies panel → mobile typing field → scroll →
prewarm → Detective's evidence validation → Detective itself. Never cut phases 1 to 5.
If the Detective is cut, say so in the pitch and show Nosana only if it is really used.

**Parallel work (if several agents or people):** A: driver, provisioning, scripts
(phases 1, 2). B: viewer, pages, visual design against the mock driver (phases 0, 4, 5
UI). C: Detective and the Nosana check (phase 6), testing against a locally running
shop by swapping `driver.exec` for a local `child_process` call. Agree `lib/types.ts`
and the API table first; they are the contract between A, B and C.

---

## 13. Risks and what to do about each

| Risk | Sign | Response |
|---|---|---|
| VM class unavailable on the account | create returns an error for `daytona-vm-*` | Mode C; change pitch wording |
| Fork does not preserve the browser | fork screenshot is blank or the desktop is gone | Try Mode B; else Mode C |
| Fork is slow (over 10 s) | preflight timing | Prewarm; do the live capture before going on stage |
| Quota exhausted | fork fails with a quota error | `MAX_LIVE_SESSIONS`, `FORK_SOURCE=golden`, or the small VM size |
| VM image has no browser or no desktop | preflight steps 3, 5 | `sudo apt-get install -y chromium` plus the desktop packages (`xvfb xfce4 xfce4-terminal x11vnc novnc dbus-x11`); if no sudo, Mode C on a default container snapshot |
| VM image has no Node | preflight step 2 | Install Node, or Mode C |
| Screenshot round trip over 2 s | preflight step 6 | Lower JPEG quality, add `scale: 0.75` and multiply click coordinates by the inverse, shorten the post-click wait |
| First-run or crash dialogs cover the page | visible in `.data/golden.png` | Fix the browser flags; fresh `--user-data-dir` |
| Golden VM pauses or dies mid-event | frame route errors | `setup-golden.ts` again (takes about a minute); keep a spare capture made earlier |
| No Nosana model live, or no tool calling | preflight step 13 | `AGENT_PROTOCOL=json`; self-deploy; last resort another provider, labelled truthfully |
| Model wanders or returns junk | no report by turn 8 | Forced final report call; the transcript still shows real commands |
| Venue wifi | everything slow | Phone tether; backup video |
| Tunnel fails for the judge's phone | link won't open | Use a second browser window on the laptop instead |

---

## 14. The 3-minute demo

Before going on stage: golden VM running with an empty cart; tester console open in one
window; a second device or window ready; one capture already made as a spare, with its
link in the clipboard and a prewarmed copy; backup video open in a tab.

1. **Problem (0:00–0:20).** Show a plain screenshot of a failed checkout. "This is what
   developers get. You can look at it. That's all you can do."
2. **Capture (0:20–0:50).** Tester console: add an item, apply `WELCOME10`, change the
   quantity, press Pay, see the error. Press **Capture LIVESHOT**. A link appears.
3. **The reveal (0:50–1:35).** Open the link on the second device. "It looks like a
   screenshot." Click on it. The badge flips to LIVE. Remove the coupon by clicking in
   the image, press Pay, the order goes through. "Same cart, same session, same moment.
   Reloading the site would not get you here. You have to be handed this moment."
4. **Copies (1:35–1:55).** Open the link in a new tab: it is back at the broken moment.
   "Everyone who opens it gets their own copy. The original is never touched."
5. **AI (1:55–2:40).** Press Ask AI Detective. Commands scroll past. The report lands.
   Click an evidence quote and it jumps to the command that produced it. "It didn't read
   a description of the bug. It went into its own copy, reproduced it, and read the
   code. Inference ran on Nosana; the machine copies are Daytona forks."
6. **Close (2:40–3:00).** Split view: still, live copy, AI transcript. "Screenshots tell
   you what happened. LIVESHOT lets you continue from where it happened."

Fallbacks: if the live capture is slow, switch to the spare link without comment. If a
copy fails to wake, use the other window. If the network is down, play the video **and
say it is a recording**. Only claim what is running: in Mode C say "restored state", and
name the real inference provider.

Likely questions and honest answers:

- *"Why not just send the URL?"* The bug lives in server memory and browser state for
  one session. A URL gives you a fresh session.
- *"Does this work on any app?"* Today the app has to run on a Daytona machine. It cannot
  rebuild a computer from an ordinary screenshot.
- *"What about databases and external APIs?"* They are not part of the copy. This demo
  is self-contained on purpose.
- *"Is it secure?"* Links are unguessable and each viewer is isolated in their own copy,
  but there are no accounts or expiry yet.

---

## 15. Acceptance checklist

- [ ] `preflight.ts` passes and a mode is recorded.
- [ ] The share page shows the still within one second of opening.
- [ ] A click on the still produces a live copy and that same click takes effect.
- [ ] The first live frame is visually the same as the still.
- [ ] Removing the coupon and pressing Pay in a copy reaches the order-confirmed screen.
- [ ] A second tab starts from the captured moment, unaffected by the first.
- [ ] The golden VM's state is unchanged by anything done in copies.
- [ ] No Daytona or Nosana credential or sandbox id appears in any browser response.
- [ ] The Detective report's evidence items each link to a command that really ran.
- [ ] The UI names the model and the provider that actually served it.
- [ ] `cleanup.ts` removes every sandbox labelled `app=liveshot`.
- [ ] The demo has been run start to finish twice and recorded once.

---

## 16. Reference: what is confirmed and what is not

Confirmed from docs or SDK types (not yet run):

- Package `@daytona/sdk`; `daytona.create/get/list/delete`; create params `snapshot`,
  `labels`, `envVars`, `public`, `autoPauseInterval`, `autoStopInterval`.
- VM snapshots `daytona-vm-small|medium|large`; fork, pause and memory snapshots are VM
  only; `sandbox.fork({ name }, timeout)`; a fork can be forked; a parent with fork
  children cannot be deleted; stop clears memory.
- Computer Use methods and shapes listed in section 7; default 1024x768; resolution
  configurable on containers only.
- `process.executeCommand`, sessions, `fs.uploadFile/downloadFile`,
  `getPreviewLink`, `getSignedPreviewUrl`.
- Nosana hosted inference base URL, auth, endpoints, error codes, key creation.

Needs a live test (all covered by preflight):

- VM class availability and quota on our account; both auto intervals set to zero.
- That a fork keeps the desktop, the browser window and Computer Use working; fork time.
- Whether the VM image has a desktop, a browser, Node and sudo; the DISPLAY number.
- Valid `format` values for `takeCompressed`; screenshot latency; arrow key names.
- noVNC port and path (stretch feature only).
- Which Nosana models are live; tool calling; image input; latency and rate limits.
