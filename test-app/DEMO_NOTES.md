# FORM & FIELD demo notes

From the repository root, start the app with `cd shop && npm start`. Node 20+ serves the committed production frontend and API at http://localhost:3000. No external runtime services are required. For development or a fresh build, run `npm ci` in `shop` first, then `npm run build`.

## Reproduce the payment failure

With the server running, run `npm run seed:bug` from the repository root. It resets the global session, adds a Catchall tray, applies WELCOME10, then changes its quantity to two. Open or reload the app, proceed to checkout, and press Pay. The displayed total is ¥6,080 and the request returns HTTP 500 with reference PAY-500; the checkout remains visible with its error callout and cart intact.

To reproduce entirely through the UI: add a tray, open checkout, apply WELCOME10, increase quantity, and pay. Adding another product or decreasing quantity after applying the coupon also reproduces the mismatch when the rounded discount changes.

The coupon saves ¥320 when first applied. Cart updates refresh subtotal but retain that amount. Payment validation freshly calculates a ¥640 discount on the ¥6,400 subtotal, expecting ¥5,760 rather than the displayed ¥6,080. Investigation entry points are `shop/server/cart.js`, `shop/server/checkout.js`, and the checkout route in `shop/server.js`.

## Recovery and evidence

Remove and reapply WELCOME10, then pay: the order succeeds at ¥5,760. Removing the coupon also permits a valid payment. Payment success clears the cart and coupon and keeps an order snapshot. Reset with `POST /api/debug/reset`.

Requests share one global session. `GET /api/state` returns the catalog and session; `GET /api/debug/state` returns the session directly. No cookies or browser storage are used. Start with `PERSIST_STATE=1 npm start` to retain mutations in `shop/data/state.json` across restarts. Without that flag each process starts with an empty session.

JSON log lines appear on stdout and in `shop/logs/app.log`; failed checkout includes chargedAmount, expectedAmount, couponCode and a stack. Log and state paths resolve from the server location, including when launched from another working directory.

Run `npm test` from the repository root for API coverage of health, catalog, malformed requests, validation, coupon normalization, quantity limits, payment failure preservation, reapplication and successful orders, removal/reset, structured logs, and state/order persistence across actual process restarts. Tests run against an isolated temporary copy and do not modify demo state.

## Minimal repair

After `setQuantity(session, product.id, quantity)` in the quantity route, refresh the subtotal and recalculate the coupon in one line: `refresh(); if (session.coupon) applyCoupon(session, session.coupon.code);`. Apply the same recalculation to the add route so all cart mutations stay consistent. This repair is documented here only; the demonstration app retains its current behavior.
