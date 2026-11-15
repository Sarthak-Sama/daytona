import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, copyFile, symlink, readFile, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('API behavior, payment validation, logging, and persisted restart', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'form-field-api-'));
  await copyFile(path.join(root, 'shop/server.js'), path.join(directory, 'server.mjs'));
  await copyFile(path.join(root, 'shop/package.json'), path.join(directory, 'package.json'));
  await cp(path.join(root, 'shop/server'), path.join(directory, 'server'), { recursive: true });
  await symlink(path.join(root, 'shop/node_modules'), path.join(directory, 'node_modules'));
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start(persist = true) {
    child = spawn(process.execPath, [path.join(directory, 'server.mjs')], { cwd: os.tmpdir(), env: { ...process.env, PORT: String(port), PERSIST_STATE: persist ? '1' : '0' }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
  async function request(endpoint, body, method = 'POST', expected = 200) {
    const response = await fetch(`${base}${endpoint}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(response.status, expected, `${method} ${endpoint}`);
    return response.json();
  }
  try {
    await start();
    await t.test('pay immediately without a coupon', async () => {
      await request('/api/debug/reset', {});
      await request('/api/cart/add', { productId: 'tray' });
      const state = await request('/api/checkout', {});
      assert.equal(state.session.order.total, 3200);
      assert.equal(state.session.order.discount, 0);
    });
    await t.test('pay immediately after applying a coupon', async () => {
      await request('/api/debug/reset', {});
      await request('/api/cart/add', { productId: 'tray' });
      await request('/api/coupon', { code: 'WELCOME10' });
      const state = await request('/api/checkout', {});
      assert.equal(state.session.order.total, 2880);
      assert.equal(state.session.order.discount, 320);
    });
    await t.test('quantity change after coupon returns payment error; removing coupon recovers same cart', async () => {
      await request('/api/debug/reset', {});
      await request('/api/cart/add', { productId: 'tray' });
      await request('/api/coupon', { code: 'WELCOME10' });
      const changed = await request('/api/cart/quantity', { productId: 'tray', quantity: 2 });
      const failure = await request('/api/checkout', {}, 'POST', 500);
      assert.equal(failure.error.ref, 'PAY-500');
      assert.deepEqual(await request('/api/debug/state', undefined, 'GET'), { ...changed.session, lastPaymentError: failure.error });
      const removed = await request('/api/coupon', undefined, 'DELETE');
      assert.deepEqual(removed.session.cart, changed.session.cart);
      assert.equal(removed.session.total, 6400);
      assert.equal(removed.session.lastPaymentError, null);
      const paid = await request('/api/checkout', {});
      assert.equal(paid.session.order.total, 6400);
      assert.equal(paid.session.order.items[0].quantity, 2);
    });
    await request('/api/debug/reset', {});
    assert.deepEqual(await request('/health', undefined, 'GET'), { status: 'ok' });
    let state = await request('/api/state', undefined, 'GET');
    assert.equal(state.products.length, 4);
    assert.equal(state.session.total, 0);
    await request('/api/checkout', {}, 'POST', 400);
    await request('/api/cart/add', { productId: 'missing' }, 'POST', 400);
    for (const quantity of [-1, 100, 1.5, '2', null]) await request('/api/cart/quantity', { productId: 'tray', quantity }, 'POST', 400);
    await request('/api/coupon', { code: 'bad' }, 'POST', 400);
    await request('/api/coupon', { code: 'WELCOME10' }, 'POST', 400);
    const malformed = await fetch(`${base}/api/cart/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    assert.ok((await malformed.json()).error.message);
    await request('/api/not-found', undefined, 'GET', 404);
    state = await request('/api/cart/add', { productId: 'tray' });
    assert.equal(state.session.total, 3200);
    state = await request('/api/coupon', { code: ' welcome10 ' });
    assert.deepEqual(state.session.coupon, { code: 'WELCOME10', discountAmount: 320 });
    state = await request('/api/cart/add', { productId: 'tray' });
    assert.equal(state.session.total, 6080);
    const before = { ...state.session, lastPaymentError: { message: 'Something went wrong. We couldn’t process your payment.', ref: 'PAY-500' } };
    const failure = await request('/api/checkout', {}, 'POST', 500);
    assert.deepEqual(failure.error, { message: 'Something went wrong. We couldn’t process your payment.', ref: 'PAY-500' });
    assert.deepEqual(await request('/api/debug/state', undefined, 'GET'), before);
    await stop();
    await start();
    assert.deepEqual(await request('/api/debug/state', undefined, 'GET'), before);
    await t.test('persisted failed checkout fails again after process restart', async () => {
      const failure = await request('/api/checkout', {}, 'POST', 500);
      assert.equal(failure.error.ref, 'PAY-500');
      assert.deepEqual(await request('/api/debug/state', undefined, 'GET'), before);
      assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'data/state.json'), 'utf8')).lastPaymentError, failure.error);
    });
    state = await request('/api/coupon', { code: 'WELCOME10' });
    assert.equal(state.session.total, 5760);
    state = await request('/api/checkout', {});
    assert.equal(state.session.order.total, 5760);
    assert.deepEqual(state.session.order.items, [{ productId: 'tray', name: 'Catchall tray', price: 3200, quantity: 2 }]);
    assert.equal(state.session.total, 0);
    assert.equal(state.session.coupon, null);
    const order = state.session.order;
    await stop();
    await start();
    assert.deepEqual((await request('/api/state', undefined, 'GET')).session.order, order);
    state = await request('/api/cart/quantity', { productId: 'pen', quantity: 99 });
    assert.equal(state.session.order, null);
    await request('/api/cart/add', { productId: 'pen' }, 'POST', 400);
    await request('/api/coupon', { code: 'WELCOME10' });
    state = await request('/api/cart/quantity', { productId: 'pen', quantity: 0 });
    assert.equal(state.session.coupon, null);
    assert.equal(state.session.total, 0);
    await request('/api/cart/add', { productId: 'cup' });
    await request('/api/coupon', { code: 'WELCOME10' });
    state = await request('/api/coupon', undefined, 'DELETE');
    assert.equal(state.session.discount, 0);
    state = await request('/api/checkout', {});
    assert.equal(state.session.order.total, 2800);
    state = await request('/api/debug/reset', {});
    assert.equal(state.session.order, null);
    await t.test('persistence disabled ignores disk state and starts empty after restart', async () => {
      await request('/api/cart/add', { productId: 'tray' });
      await stop();
      await start(false);
      assert.deepEqual((await request('/api/state', undefined, 'GET')).session, {
        cart: [], coupon: null, subtotal: 0, discount: 0, total: 0, order: null, lastPaymentError: null,
      });
      await request('/api/cart/add', { productId: 'pen' });
      await stop();
      await start(false);
      assert.equal((await request('/api/state', undefined, 'GET')).session.cart.length, 0);
    });
    const lines = (await readFile(path.join(directory, 'logs/app.log'), 'utf8')).trim().split('\n').map(JSON.parse);
    const failed = lines.find(line => line.action === 'checkout.failed');
    assert.equal(failed.chargedAmount, 6080);
    assert.equal(failed.expectedAmount, 5760);
    assert.equal(failed.couponCode, 'WELCOME10');
    assert.ok(failed.stack.includes('Error:'));
    assert.ok(lines.every(line => !Number.isNaN(Date.parse(line.timestamp))));
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
