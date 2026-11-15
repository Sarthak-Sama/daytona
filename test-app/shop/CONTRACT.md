# FORM & FIELD API contract

Node 20+, Express, port 3000 on 0.0.0.0. React/Vite/Tailwind frontend served from committed dist. No runtime external requests. One global in-memory session, no cookies or browser storage. Optional PERSIST_STATE=1 loads and synchronously writes data/state.json on every mutation. All prices are integer JPY. Shipping is free.

## State

GET /api/state returns `{ products, session }`. Every successful cart or coupon mutation returns this same envelope. Products are fixed: `{id,name,category,description,price,image}`. image is a local `/products/*.svg` path.

Catalog (frontend creates local artwork at the specified paths):
- tray: Catchall tray, DESK ESSENTIALS, A place for the everyday., 3200, /products/tray.svg
- notebook: Daily notebook, PAPER GOODS, Room for a little clarity., 1800, /products/notebook.svg
- pen: Studio pen, WRITING TOOLS, A smoother train of thought., 2400, /products/pen.svg
- cup: Arc pen cup, DESK ESSENTIALS, Keep good ideas close., 2800, /products/cup.svg

Session: `{cart:[{productId,quantity}], coupon:null|{code:"WELCOME10",discountAmount:number}, subtotal:number, discount:number, total:number, lastPaymentError:null|{message:string,ref:string}, order:null|{id:string,items:[{productId,name,price,quantity}],subtotal,discount,total,createdAt:string}}`. Totals are refreshed before serialization; discount reads the saved coupon amount. Cart quantity integer 1–99; setting zero removes line. Empty cart has zero totals and coupon null. An order copies the purchased items and totals. Successful payment clears cart/coupon and stores order. Cart changes clear previous order. State and catalog are authoritative; frontend derives no monetary values.

## Actions

- POST /api/cart/add `{productId}` increments quantity or adds one.
- POST /api/cart/quantity `{productId,quantity}` sets quantity (zero removes).
- POST /api/coupon `{code}` trims and uppercases; WELCOME10 stores Math.round(subtotal * 0.1) at apply time; invalid code returns 400 with human-readable message.
- DELETE /api/coupon removes coupon.
- POST /api/checkout `{}` compares displayed total with subtotal minus freshly calculated coupon discount. On equality creates order and returns `{products,session}`. On mismatch returns 500 `{error:{message:"Something went wrong. We couldn’t process your payment.",ref:"PAY-500"}}`; cart and coupon remain intact. Frontend logs status and ref with console.error, stays on checkout and displays a large persistent error callout.
- GET /api/debug/state returns full session directly.
- POST /api/debug/reset resets cart, coupon and order, returns `{products,session}`.
- GET /health returns `{status:"ok"}`.

Other errors use `{error:{message,ref?}}` with appropriate 400/404 status. JSON parse errors return 400. Add and quantity updates retain any existing coupon amount; removing the final line clears coupon. Every mutation logs JSON lines to stdout and logs/app.log with ISO timestamp, action, and useful values. Checkout failure includes chargedAmount, expectedAmount, couponCode and stack. Logging and persistence paths resolve relative to server files, independent of current directory.

## UI

Three client screens only: shop, checkout, confirmed. Initial screen shop; cart always fetched from server on load; navigation to checkout loads latest state. Four products with original local SVG art. Promo prominently shows WELCOME10. Pre-filled synthetic shipping/payment details require no typing. Every interactive element has stable data-testid, at least 44px targets, focus-visible rings and accessible labels. Checkout at 1024x768 and 1280x720 must show cart quantity controls, coupon, all totals, pay and persistent failure callout without page scrolling. Frontend changes only shop/src, shop/public, shop/index.html and frontend configs; server owner handles package files, server modules and install/build coordination.

## Saved payment error

A failed payment stores `session.lastPaymentError` with the returned message and ref and persists it with `PERSIST_STATE=1`. On page load, a saved payment error opens checkout and displays the real saved banner. Successful cart/coupon changes, successful checkout and reset clear it. Legacy state files without this field load with null. The payment validation behavior is unchanged.
