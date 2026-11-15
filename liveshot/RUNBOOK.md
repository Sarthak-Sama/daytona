# Credential handoff

From `/Users/yato_sar/hackathon/daytona/liveshot`, run these in order. Local mode restores server state in independent local browser processes; it does not copy browser memory. STUB exercises the Detective plumbing and must never be presented as a model demo.

1. `open -e .env.local` — Paste the Daytona key into `DAYTONA_API_KEY`, the Nosana key into `LLM_API_KEY`, set `LLM_BASE_URL=https://inference.nosana.com/v1` and `LLM_PROVIDER_LABEL=Nosana`; success is a saved file with real keys only on this computer.
2. `set -a; source .env.local; set +a; curl --fail -sS -H "Authorization: Bearer $LLM_API_KEY" "$LLM_BASE_URL/models"` — Success is a models list; choose a currently served model and save its id as `LLM_MODEL` in `.env.local`.
3. `npm run preflight` — Success is PASS output plus `.data/preflight.json` containing measured display, browser, screenshot format, resolution, timings and the recommended mode; inspect failed steps before proceeding.
4. `open -e .env.local` — Set `LIVESHOT_MODE` and `AGENT_PROTOCOL` from the preflight recommendation, preserving `PREWARM=1` for rehydrate; success is a mode backed by passing checks.
5. `npm run setup-golden -- --reuse` — Success is `.data/golden.json` and a screenshot showing the shop filling the remote display.
6. `npm run dev` — Success is the tester console at `http://localhost:4000` with the active mode and provider labeled truthfully.
7. `cloudflared tunnel --url http://localhost:4000` — Success is an HTTPS URL that opens the app on a second device; use that origin for share links.
8. `npm run cleanup` — Success is deletion of all `app=liveshot` sandboxes, children before parents.

# Local development

`npm install` installs app dependencies. `npx playwright install chromium` installs the real browser. `npm run dev` starts on port 4000 with the checked-in example configuration copied to `.env.local` (the working workspace already has this local file). `npm run smoke` exercises the HTTP API against that running app. `npx tsc --noEmit` checks the entire project including the untested Daytona integration.

The demo shop is `../test-app/shop`; override `SHOP_DIR` only when relocating it. Local machines and captures are in ignored `.data/local/`. Never expose this directory or send DEMO_NOTES.md to the Detective.
