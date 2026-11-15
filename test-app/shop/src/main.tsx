import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
type Product = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  image: string;
};
type Order = {
  id: string;
  items: { productId: string; name: string; price: number; quantity: number }[];
  subtotal: number;
  discount: number;
  total: number;
  createdAt: string;
};
type Session = {
  cart: { productId: string; quantity: number }[];
  coupon: null | { code: string; discountAmount: number };
  subtotal: number;
  discount: number;
  total: number;
  order: Order | null;
  lastPaymentError?: { message: string; ref: string } | null;
};
type State = { products: Product[]; session: Session };
const yen = (v: number) => `¥${v.toLocaleString("ja-JP")}`;
function Arrow({ back = false }: { back?: boolean }) {
  return (
    <span aria-hidden="true" className="text-lg">
      {back ? "←" : "↗"}
    </span>
  );
}
function App() {
  const [data, setData] = useState<State | null>(null),
    [screen, setScreen] = useState<"shop" | "checkout" | "confirmed">("shop"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [coupon, setCoupon] = useState(""),
    [couponError, setCouponError] = useState("");
  async function refresh() {
    try {
      const r = await fetch("/api/state");
      if (!r.ok)
        throw Error("Unable to load your bag. Please refresh the page.");
      const d = await r.json();
      setData(d);
      setError(d.session.lastPaymentError?.message || "");
      return d;
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh().then(d => {
      if (d?.session.lastPaymentError && d.session.cart.length) setScreen("checkout");
    });
  }, []);
  async function action(path: string, body?: unknown, method = "POST") {
    setBusy(true);
    try {
      const r = await fetch(`/api/${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (path === "checkout") {
          console.error(`Payment failed: HTTP ${r.status} · ${d.error?.ref || "UNKNOWN"}`);
          setError(d.error?.message || "Unable to process your payment.");
        } else if (path === "coupon")
          setCouponError(d.error?.message || "Please check your code.");
        else setError(d.error?.message || "Something went wrong.");
        return;
      }
      setData(d);
      setError(d.session.lastPaymentError?.message || "");
      if (path === "coupon") {
        setCoupon("");
        setCouponError("");
      }
      if (path === "checkout") {
        setError("");
        setScreen("confirmed");
        window.scrollTo(0, 0);
      }
    } catch {
      setError("Connection interrupted. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function navigate(next: "shop" | "checkout") {
    const refreshed = await refresh();
    setScreen(next);
    setError(refreshed?.session.lastPaymentError?.message || "");
    setCouponError("");
    window.scrollTo(0, 0);
  }
  const count = data?.session.cart.reduce((n, i) => n + i.quantity, 0) || 0;
  const s = data?.session;
  return (
    <div className="min-h-screen">
      <div className="flex h-8 items-center justify-center gap-2 bg-ink px-3 text-center text-[10px] tracking-wide text-paper">
        A little welcome, on us.{" "}
        <span className="font-mono">10% OFF WITH WELCOME10</span>
        <span aria-hidden="true">↗</span>
      </div>
      <header className={`mx-auto flex ${screen === "checkout" ? "h-[68px]" : "h-[82px]"} max-w-[1440px] items-center justify-between border-b border-line px-6 md:px-12`}>
        <button
          data-testid="logo"
          onClick={() => navigate("shop")}
          aria-label="Form and Field home"
          className="flex min-h-11 items-center gap-3"
        >
          <span className="serif text-[25px] leading-[.8] tracking-[-1.5px]">
            FORM<span className="mx-1 text-accent italic">&</span>FIELD
            <span className="ml-1 align-top font-sans text-[9px] tracking-normal">
              ®
            </span>
          </span>
        </button>
        <div className="hidden eyebrow text-muted md:block">
          Good objects. A better everyday.
        </div>
        <button
          data-testid="bag-button"
          className="action gap-4 !px-0"
          onClick={() => navigate("checkout")}
          aria-label={`Open bag, ${count} items`}
        >
          <span className="eyebrow">Your bag</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-ink text-[11px]">
            {count}
          </span>
        </button>
      </header>
      {!data ? (
        <main className="mx-auto max-w-[1344px] px-6 py-20">
          <h1 className="serif text-5xl">
            {error || "Making room for good things…"}
          </h1>
        </main>
      ) : screen === "shop" ? (
        <main className="mx-auto max-w-[1440px] px-6 pb-8 md:px-12">
          <section className="flex flex-col justify-between gap-6 border-b border-line pb-7 pt-9 md:flex-row md:items-end">
            <div>
              <p className="eyebrow mb-4 text-accent">
                The everyday collection / No. 001
              </p>
              <h1 className="serif text-[54px] leading-[.99] tracking-[-2px] md:text-[72px]">
                A little order.
                <br />
                <span className="italic">A lot of possibility.</span>
              </h1>
            </div>
            <p className="max-w-[260px] text-[13px] leading-6 text-muted">
              Considered essentials for your desk, your rituals, and the ideas
              in between. Made for the everyday.
            </p>
          </section>
          <div className="flex items-center justify-between py-5">
            <h2 className="eyebrow">Objects for a thoughtful day</h2>
            <span className="eyebrow text-muted">04 objects</span>
          </div>
          <section
            aria-label="Products"
            className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4"
          >
            {data.products.map((p, i) => (
              <article key={p.id}>
                <div className="relative overflow-hidden">
                  <img
                    src={p.image}
                    alt={p.name}
                    className="aspect-[1.08] w-full object-cover"
                  />
                  <span className="absolute left-3 top-3 eyebrow text-muted">
                    0{i + 1}
                  </span>
                  <span className="absolute bottom-3 right-3 eyebrow text-muted">
                    F&F / Objects
                  </span>
                </div>
                <div className="mb-2 mt-4 flex items-center justify-between gap-2">
                  <h3 className="serif text-[24px] leading-tight">{p.name}</h3>
                  <span className="font-mono text-[11px]">{yen(p.price)}</span>
                </div>
                <p className="text-[11px] text-muted">{p.description}</p>
                <button
                  disabled={busy}
                  onClick={() => action("cart/add", { productId: p.id })}
                  data-testid={`add-${p.id}`}
                  className="mt-3 flex min-h-11 w-full items-center justify-between border-b border-ink text-[11px]"
                >
                  Add to bag{" "}
                  <span aria-hidden="true" className="text-xl">
                    +
                  </span>
                </button>
              </article>
            ))}
          </section>
          <div className="mt-8 flex justify-between border-t border-line py-4 eyebrow text-muted">
            <span>Thoughtfully chosen. Simply useful.</span>
            <span>Tokyo · Est. 2024</span>
          </div>
        </main>
      ) : screen === "checkout" ? (
        <main className="mx-auto max-w-[1440px] px-6 pb-3 md:px-12">
          <div className="flex items-end justify-between pb-4 pt-4">
            <div>
              <p className="eyebrow mb-2 text-accent">
                A few good things, almost yours.
              </p>
              <h1 className="serif text-[45px] leading-none tracking-[-1.5px]">
                Your bag
                <span className="ml-3 align-top font-mono text-[12px] tracking-normal">
                  ({count.toString().padStart(2, "0")})
                </span>
              </h1>
            </div>
            <button
              className="action gap-3 !px-0 text-muted"
              data-testid="continue-shopping"
              onClick={() => navigate("shop")}
            >
              <Arrow back />
              <span className="text-[11px]">Continue exploring</span>
            </button>
          </div>
          {s!.cart.length === 0 ? (
            <section className="border-t border-line py-20">
              <h2 className="serif text-3xl">Make room for something good.</h2>
              <p className="mt-3 text-sm text-muted">
                Your bag is waiting for a little inspiration.
              </p>
              <button
                data-testid="empty-shop"
                className="action mt-6 gap-6 bg-ink text-paper"
                onClick={() => navigate("shop")}
              >
                Explore the collection <Arrow />
              </button>
            </section>
          ) : (
            <div className="grid items-start gap-7 border-t border-line pt-4 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
              <section aria-label="Bag items">
                <div className="mb-2 flex justify-between eyebrow text-muted">
                  <span>The good things</span>
                  <span>Price / JPY</span>
                </div>
                <div>
                  {s!.cart.map((item) => {
                    const p = data.products.find(
                      (p) => p.id === item.productId,
                    )!;
                    return (
                      <article
                        key={p.id}
                        className="grid min-h-[80px] grid-cols-[56px_1fr_auto] items-center gap-x-3 border-b border-line py-1 sm:flex sm:gap-4"
                      >
                        <img
                          src={p.image}
                          alt=""
                          className="row-span-2 h-14 w-14 self-start object-cover sm:h-[64px] sm:w-[72px] sm:self-auto"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="hidden">{p.category}</p>
                          <h2 className="serif text-[21px] leading-6">
                            {p.name}
                          </h2>
                          <button
                            disabled={busy}
                            aria-label={`Remove ${p.name}`}
                            data-testid={`remove-${p.id}`}
                            onClick={() =>
                              action("cart/quantity", {
                                productId: p.id,
                                quantity: 0,
                              })
                            }
                            className="min-h-11 min-w-11 text-[12px] text-muted underline underline-offset-2"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="col-start-2 row-start-2 flex h-11 shrink-0 items-center justify-self-start border border-line">
                          <button
                            disabled={busy}
                            data-testid={`decrease-${p.id}`}
                            aria-label={`Decrease ${p.name} quantity`}
                            onClick={() =>
                              action("cart/quantity", {
                                productId: p.id,
                                quantity: item.quantity - 1,
                              })
                            }
                            className="h-11 w-11 text-lg"
                          >
                            −
                          </button>
                          <span
                            data-testid={`quantity-${p.id}`}
                            className="min-w-5 text-center font-mono text-xs"
                          >
                            {item.quantity}
                          </span>
                          <button
                            disabled={busy || item.quantity >= 99}
                            data-testid={`increase-${p.id}`}
                            aria-label={`Increase ${p.name} quantity`}
                            onClick={() =>
                              action("cart/quantity", {
                                productId: p.id,
                                quantity: item.quantity + 1,
                              })
                            }
                            className="h-11 w-11 text-lg"
                          >
                            +
                          </button>
                        </div>
                        <span className="col-start-3 row-start-1 w-[62px] shrink-0 text-right font-mono text-[11px]">
                          {yen(p.price)}
                          <span className="block text-[9px] text-muted">
                            each
                          </span>
                        </span>
                      </article>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-5 border border-line p-3">
                  <div>
                    <p className="eyebrow mb-2 text-muted">
                      01 / Sample delivery
                    </p>
                    <p className="text-[11px] leading-[1.7]">
                      Alex Morgan
                      <br />
                      1-2-3 Jingumae, Shibuya
                      <br />
                      Tokyo 150-0001, Japan
                    </p>
                  </div>
                  <div className="border-l border-line pl-5">
                    <p className="eyebrow mb-2 text-muted">02 / Payment</p>
                    <p className="text-[11px] leading-[1.7]">
                      VISA <span className="font-mono">•••• 4242</span>
                      <br />
                      Alex Morgan
                      <br />
                      <span className="text-muted">Sample payment details</span>
                    </p>
                  </div>
                </div>
                
              </section>
              <aside className="bg-[#eae8df] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="serif text-[28px] leading-none">
                    The particulars.
                  </h2>
                  <span className="eyebrow text-muted">Order summary</span>
                </div>
                <form
                  className="border-y border-[#cacaBE] py-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    action("coupon", { code: coupon });
                  }}
                >
                  <label
                    htmlFor="coupon"
                    className="eyebrow mb-1 block text-muted"
                  >
                    A little something extra
                  </label>
                  {s!.coupon ? (
                    <div className="flex min-h-11 items-center justify-between">
                      <span
                        data-testid="applied-coupon"
                        className="font-mono text-xs"
                      >
                        ✓ {s!.coupon.code}
                      </span>
                      <button
                        disabled={busy}
                        type="button"
                        data-testid="remove-coupon"
                        onClick={() => action("coupon", undefined, "DELETE")}
                        className="min-h-11 px-2 text-[11px] underline underline-offset-2"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex min-h-[46px] border border-[#bcbeb0]">
                      <input
                        id="coupon"
                        data-testid="coupon-input"
                        value={coupon}
                        onChange={(e) => setCoupon(e.target.value)}
                        placeholder="Enter promo code"
                        className="min-h-11 min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] placeholder:text-muted"
                      />
                      <button
                        disabled={busy}
                        data-testid="apply-coupon"
                        className="min-h-11 border-l border-[#bcbeb0] px-4 text-[13px]"
                      >
                        Apply ↗
                      </button>
                    </div>
                  )}
                  {couponError && (
                    <p role="alert" className="mt-2 text-xs text-accent">
                      {couponError}
                    </p>
                  )}
                </form>
                <dl className="space-y-1.5 py-2.5 text-[13px]">
                  <div className="flex justify-between">
                    <dt>Subtotal</dt>
                    <dd data-testid="subtotal" className="font-mono">
                      {yen(s!.subtotal)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Delivery</dt>
                    <dd className="font-mono text-[10px]">ON THE HOUSE</dd>
                  </div>
                  {s!.coupon && (
                    <div className="flex justify-between text-accent">
                      <dt>
                        Welcome discount{" "}
                        <span className="text-[10px]">(10%)</span>
                      </dt>
                      <dd data-testid="discount" className="font-mono">
                        −{yen(s!.discount)}
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="flex items-baseline justify-between border-t border-[#cacaBE] py-2.5">
                  <span className="serif text-2xl">Total</span>
                  <div>
                    <span className="mr-2 font-mono text-[9px] text-muted">
                      JPY
                    </span>
                    <span
                      data-testid="total"
                      className="font-mono text-[24px] tracking-[-1px]"
                    >
                      {yen(s!.total)}
                    </span>
                  </div>
                </div>
                {error && (
                  <div
                    data-testid="checkout-error"
                    role="alert"
                    className="mb-3 border border-l-4 border-accent bg-[#f5ddd3] px-3 py-3 text-[#87321f]"
                  >
                    <div className="flex gap-2">
                      <span
                        className="font-serif text-xl leading-none"
                        aria-hidden="true"
                      >
                        !
                      </span>
                      <div>
                        <p className="text-[14px] font-bold leading-[18px]">
                          Payment couldn’t be completed
                        </p>
                        <p className="mt-1 text-[13px] leading-[18px]">{error}</p>
                        <p className="mt-1 font-mono text-[10px]">
                          PAY-500 · Your bag is saved. Please try again.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <button
                  data-testid="pay-button"
                  disabled={busy}
                  onClick={() => action("checkout", {})}
                  className="action w-full justify-between bg-ink text-paper text-[14px]"
                >
                  <span>
                    {busy
                      ? "One moment…"
                      : `Pay ${yen(s!.total)} & place order`}
                  </span>
                  <Arrow />
                </button>
                <p className="mt-3 text-center font-mono text-[8px] tracking-wide text-muted">
                  SECURE CHECKOUT · ALL PRICES INCLUDE TAX
                </p>
              </aside>
            </div>
          )}
        </main>
      ) : (
        <main className="mx-auto max-w-[1000px] px-6 py-14 md:py-20">
          <p className="eyebrow text-accent">A good day for good objects.</p>
          <div className="mt-5 flex items-start gap-5">
            <span className="serif text-[60px] text-accent">✳</span>
            <h1 className="serif text-[60px] leading-none tracking-[-2px] md:text-[80px]">
              Yours, thoughtfully.
              <br />
              <span className="italic">Thank you.</span>
            </h1>
          </div>
          <p className="mt-6 max-w-md text-sm leading-6 text-muted">
            Your order is confirmed. A little more order, and a little more
            possibility, are on their way.
          </p>
          <section className="mt-9 max-w-xl border-y border-line py-5">
            <div className="flex justify-between">
              <span className="eyebrow text-muted">Order reference</span>
              <span data-testid="order-id" className="max-w-[65%] break-all text-right font-mono text-xs">
                {s!.order?.id}
              </span>
            </div>
            <div className="my-5 border-y border-line py-3">
              {s!.order?.items.map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span>
                    {item.name}{" "}
                    <span className="ml-2 font-mono text-xs text-muted">
                      × {item.quantity}
                    </span>
                  </span>
                  <span className="font-mono text-xs">
                    {yen(item.price)} each
                  </span>
                </div>
              ))}
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd className="font-mono">{yen(s!.order?.subtotal || 0)}</dd>
              </div>
              {!!s!.order?.discount && (
                <div className="flex justify-between text-accent">
                  <dt>Welcome discount</dt>
                  <dd className="font-mono">−{yen(s!.order.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd>Complimentary</dd>
              </div>
            </dl>
            <div className="mt-4 flex justify-between">
              <span className="serif text-2xl">Paid with thanks</span>
              <span data-testid="order-total" className="font-mono text-xl">
                {yen(s!.order?.total || 0)}
              </span>
            </div>
          </section>
          <button
            data-testid="confirmed-shop"
            className="action mt-8 gap-10 bg-ink text-paper"
            onClick={() => navigate("shop")}
          >
            Back to the collection <Arrow />
          </button>
        </main>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
