# Verification

Checked on 2026-11-15 with Node 22 (Node 20+ required).

- API suite: 6 tests pass. Covers every checkout sequence, invalid input, empty cart, saved failed state after actual process restart, persistence disabled, order snapshots, and structured error logs.
- Production frontend build and `tsc --noEmit` pass.
- Independent QA installed a standalone copy using `npm ci --omit=dev`, started it from another working directory, and received HTTP 200 for health, HTML, JS/CSS, and all four product images without a build.
- Real browser sequence: tray → WELCOME10 → quantity two → Pay produced PAY-500 at ¥6,080. Removing the coupon and paying succeeded. Console includes `Payment failed: HTTP 500 · PAY-500`.
- Checkout verified at 1024×768 and 1280×720, including four distinct product rows and the payment failure. Document height equals viewport height, scroll position is zero, and all controls, totals, failure message, and Pay are visible. Every measured interactive target is at least 44×44px, including the unapplied coupon field.
- Shop and checkout checked at 390×844; no horizontal overflow. Keyboard Tab focused Apply with a visible solid outline. No hover-dependent UI or animation is used.
- Screenshots are saved at their exact named pixel dimensions in `screenshots/`.
- Code and rendered asset URLs use only local requests and system fonts. Browser console shows the expected payment failures, with no unrelated application errors. A browser Network-panel trace was not captured, so that specific acceptance check remains unverified. Execution on the target Linux VM and a memory-preserving VM copy were not available locally; disk persistence across actual process restarts was verified.

## UI implementation

Three screens were created in `shop/src/main.tsx`, with shared Tailwind styles in `shop/src/style.css`, local illustrations under `shop/public/products/`, and production output in `shop/dist/`. The checkout places cart controls on the left and the coupon, authoritative totals, persistent alert, and Pay action together on the right. Semantic headings, labelled controls, keyboard focus outlines, alert announcements, readable error contrast, and stable test IDs support screenshot and keyboard use.
