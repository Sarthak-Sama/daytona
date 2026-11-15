# FORM & FIELD

A small, offline-ready checkout demo. Node.js 20 or newer is required.

## Run

```sh
cd shop
npm ci --omit=dev
node server.js
```

Open http://localhost:3000. The server listens on all interfaces on port 3000. The built frontend is included in `shop/dist`; no build step or outgoing network access is needed after installation. Copy only `shop/` to the demo VM.

This workspace already has another app on port 3000, so the review server runs at http://localhost:3300 using `PORT=3300 node server.js`. For that server, rehearse with `BASE_URL=http://localhost:3300 npm run seed:bug` from this directory. The VM uses the default port 3000.

For state that survives process restarts, run `PERSIST_STATE=1 node server.js`. This saves the global session to `shop/data/state.json`; persistence is off by default. All browsers share the server's cart. Reloading keeps that live cart; a fresh server without persistence starts empty.

## Rehearse and verify

From this directory, with a server already running:

```sh
npm run seed:bug
npm test
```

The seed command resets the shared session and prepares checkout for rehearsal. Tests run isolated server processes. See [DEMO_NOTES.md](DEMO_NOTES.md) for the sequence and investigation notes. `POST /api/debug/reset` clears the shared session.

For frontend development: `cd shop && npm ci && npm run build`. Rebuild `shop/dist` after source changes. The running Express server serves the built output.
