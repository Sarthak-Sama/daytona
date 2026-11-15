# LIVESHOT API contract



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


Public metadata also includes mode, width, height, createdAt, note, logsTail, debugState. Golden includes mode. Internal refs, sandbox ids and file paths must never be serialized. Investigation outputs redact local paths and credentials.
