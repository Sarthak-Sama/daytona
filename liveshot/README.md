# LIVESHOT

Turn a captured shop screen into an independent, interactive copy.

```sh
cd /Users/yato_sar/hackathon/daytona/liveshot
npm install
npx playwright install chromium
npm run dev
```

Open [localhost:4000](http://localhost:4000). The default local mode runs a separate persisted shop server and a real headless Chromium page for each machine. Use the image to add a product, open the bag, apply WELCOME10, change its quantity and press Pay. Capture the failure, open the share link and click the still to wake a private copy. Remove the coupon and pay in that copy; the tester's cart stays unchanged. A new tab creates another independent copy.

Local mode restores server state and reopens the captured screen. Payment errors are saved with the cart and displayed immediately in restored copies. It is always marked LOCAL MODE. It does not claim to preserve browser memory.

```sh
npm run smoke
npx tsc --noEmit
```

The Detective uses a runtime-evidence stub when no LLM key is set or `LLM_BASE_URL=stub`. STUB must never be presented as an inference demo. For a real compatible provider, set `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, and a truthful `LLM_PROVIDER_LABEL` in `.env.local`. Browser responses receive neither provider secrets nor machine handles.

See [RUNBOOK.md](RUNBOOK.md) for credential handoff, [API.md](API.md) for HTTP contracts and [LIVESHOT_PLAN.md](LIVESHOT_PLAN.md) for the complete specification. The shop is read from `../test-app/shop`; its source is not modified. DEMO_NOTES.md is never included in machine copies, uploads, prompts or Detective fixtures.

The Daytona driver, provisioning and account scripts are written against the installed SDK but require the credentialed preflight before use. Nothing has been run against Daytona or Nosana during local development.
