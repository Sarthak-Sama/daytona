# LIVESHOT final hour: Agent B (sponsors: Nosana + Daytona)

You are finishing a hackathon project. Hacking ends 16:15 JST today; **code freeze is 16:00**.
You are wiring the two sponsor products into an app that already works locally. Another agent
(Agent A) is adding product features in parallel on the demo laptop. Do not rebuild or refactor.
Do not read `DEMO_NOTES.md`, and never send it or `LIVESHOT_PLAN.md` to the Detective model.

Repo: git root `hackathon/daytona`; the app is in `liveshot/`, the demo shop in `test-app/shop/`.
Setup if this is a fresh clone: `git pull`, `git checkout -b cloud`, `cd liveshot && npm install`
(`npx playwright install chromium` only if you need to run local mode yourself).

Read first, and nothing else unless blocked: the handoff file in `liveshot/` sections 1, 9, 10, 12;
`SDK_DIFFERENCES.md`; then the files named in each task. Installed SDK is `@daytona/sdk` 0.231.1:
**trust the installed type declarations over any document.**

## Ownership (to avoid merge conflicts)

You own: `.env.local` cloud values, `lib/agent/llm.ts`, `lib/machine/daytona.ts`,
`lib/machine/provision.ts`, `lib/machine/index.ts`, `scripts/preflight.ts`,
`scripts/setup-golden.ts`, `scripts/cleanup.ts`, and any new file under `lib/machine/`.
Agent A owns `components/`, `app/`, `lib/backend.ts`, `lib/api.ts`, `lib/machine/local.ts`,
`lib/types.ts`. **Do not edit A's files.** If you truly need a one-line change there, stop and
ask the user to relay it.

Keys go in `liveshot/.env.local` only. Never print them, commit them, or put them in reports.
Use `LIVESHOT_DATA_DIR=.data/cloud` for every cloud script so local data is untouched.

## Task 1 (start immediately, runs unattended): Daytona preflight

```sh
LIVESHOT_DATA_DIR=.data/cloud npm run preflight
```

Start it in the background and move to Task 2 while it runs. It is UNTESTED code: if it crashes
on a type/SDK mismatch, fix the specific call from the installed declarations and rerun. Make sure
its cleanup ran (no leftover `app=liveshot` sandboxes) before any rerun.

## Task 2 (15:20–15:35): real Nosana inference for the Detective

1. `.env.local`: `LLM_BASE_URL=https://inference.nosana.com/v1`, `LLM_PROVIDER_LABEL=Nosana`,
   `LLM_VISION=0`, and make sure nothing forces `stub`.
2. List live models without printing the key:
   ```sh
   bash -c 'set -a; source .env.local; set +a; curl --fail -sS -H "Authorization: Bearer $LLM_API_KEY" "$LLM_BASE_URL/models"'
   ```
   Pick a currently served model with ≥32k context; set `LLM_MODEL` to its exact id. Do not use a
   name from memory. 401 = bad key, 402 = no credits, 404 = model not served: tell the user at once.
3. `npm run test:agent`, then one real investigation against a local capture (start the app in
   local mode, or ask the user to trigger one on the demo laptop).
4. If the model returns no `tool_calls`, set `AGENT_PROTOCOL=json` and retest. If the model puts
   its answer in `message.reasoning` with empty `content`, handle that in `lib/agent/llm.ts`.
5. Keep total investigation time under ~90 s if possible: prefer a faster model over a smarter
   one. The demo needs a report with valid evidence, not a perfect essay.
6. Done when: a report from the real model appears with evidence items that validate, and the UI
   header names the real model id and "Nosana". Send the user the exact non-secret env lines
   (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_PROVIDER_LABEL`, `AGENT_PROTOCOL`) for the demo laptop.

## Task 3 (15:35–15:55): Daytona in the live path

Read `.data/cloud/preflight.json`. Choose **one** branch; do not attempt both.

### Branch H — hybrid (default; take this unless preflight is fully green)

Human copies stay on the local driver. **Only the AI Detective's copy runs in a Daytona sandbox.**
It needs no desktop, browser, fork or Computer Use: only create, upload, exec, delete.

- New file `lib/machine/daytona-exec.ts`: an exec-only machine.
  - `spawn`: `daytona.create(...)` a default container sandbox with labels
    `{ app: 'liveshot', role: 'ai' }` (create timeout 120 s); tar the shop locally excluding
    `node_modules`, `logs`, `data` (assert `DEMO_NOTES.md` is not in the tarball); upload; extract;
    `npm ci --omit=dev` (timeout 180); upload the capture's saved `state.json` into `shop/data/`
    and the captured logs into `shop/logs/`; start with
    `PERSIST_STATE=1 nohup node server.js > /tmp/shop.log 2>&1 &`; poll `/health` until 200.
    Check Node exists first (`node -v`); install it if missing, as `provision.ts` does. Reuse
    helpers from `provision.ts` rather than rewriting them.
  - The local capture's saved files live under `.data/local/captures/<captureId>/` (see handoff
    section 5); read `state.json` and logs from there.
  - `exec`: `sandbox.process.executeCommand(cmd, shopDir, undefined, timeoutSec)`; bounded output.
    The shop listens on 3000 inside the sandbox, so the Detective's `localhost:3000` commands work
    unchanged.
  - `destroy`: delete the sandbox. `screenshot`/`input`: throw "not supported for AI copies".
- Route to it in `lib/machine/index.ts`: when `AI_DRIVER=daytona`, wrap the current driver in a
  composite that sends spawn for AI sessions to `daytona-exec` and dispatches
  `exec`/`destroy` by machine-id prefix (give these ids a distinct prefix such as `dx-`). Find how
  the backend marks an AI spawn (the `name` argument or session label) by reading the call site in
  `lib/backend.ts` — read only, do not edit it. If the kind is not derivable from existing
  arguments, ask the user to relay a one-line change to Agent A.
- Spawn takes tens of seconds; that is acceptable because investigations auto-start at capture.
- Public responses must still contain no sandbox ids.
- Done when: with `AI_DRIVER=daytona`, an investigation's commands visibly run in the Daytona
  sandbox (confirm in the Daytona dashboard or by `hostname` output differing from the laptop),
  the report validates, and deleting the session removes the sandbox.

### Branch F — full cloud (only if preflight says `modeVerified=true` for fork or hot-snapshot)

`LIVESHOT_DATA_DIR=.data/cloud npm run setup-golden -- --reuse`, inspect the saved golden
screenshot yourself, set `LIVESHOT_MODE` from preflight, run `npm run smoke`. **Hard stop at
15:50:** if capture → session → click is not clean by then, abandon it and do Branch H's
minimum (or, if out of time, report Daytona as not in the live path).

## Freeze at 15:55–16:00

1. `npx tsc --noEmit` passes.
2. Commit on `cloud`, push, tell the user to merge into `main` on the demo laptop.
3. Give the user, in one short message: the non-secret env lines to set on the demo laptop
   (including `AI_DRIVER` and `LIVESHOT_MODE`), which branch (H/F/none) is live, and the exact
   truthful sentence for the pitch, one of:
   - Branch F: "Machine copies are Daytona forks; inference ran on Nosana."
   - Branch H: "The AI investigates in its own Daytona sandbox with the captured state restored;
     inference ran on Nosana. Human copies in this demo run locally."
   - Neither: "Inference ran on Nosana. Daytona is written but was not in the live path today."
4. Do **not** run `npm run cleanup` until the user says the demo is over; it deletes every
   `app=liveshot` resource. Before the freeze, delete only stray sandboxes you created.

## Rules

- Time boxes are hard. A truthful smaller claim beats a broken bigger one.
- Never label STUB output as a model, and never label another provider as Nosana.
- Say "restored state", never "frozen memory", unless fork mode was verified live.
- Report to the user only: task name, PASS/FAIL, one line of evidence.
