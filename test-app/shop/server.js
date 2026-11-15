import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshSession, applyCoupon, setQuantity } from './server/cart.js';
import { createOrder, validatePayment } from './server/checkout.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(directory, 'data/state.json');
const logPath = path.join(directory, 'logs/app.log');
const products = [
  { id: 'tray', name: 'Catchall tray', category: 'DESK ESSENTIALS', description: 'A place for the everyday.', price: 3200, image: '/products/tray.svg' },
  { id: 'notebook', name: 'Daily notebook', category: 'PAPER GOODS', description: 'Room for a little clarity.', price: 1800, image: '/products/notebook.svg' },
  { id: 'pen', name: 'Studio pen', category: 'WRITING TOOLS', description: 'A smoother train of thought.', price: 2400, image: '/products/pen.svg' },
  { id: 'cup', name: 'Arc pen cup', category: 'DESK ESSENTIALS', description: 'Keep good ideas close.', price: 2800, image: '/products/cup.svg' },
];
const freshSession = () => ({ cart: [], coupon: null, subtotal: 0, discount: 0, total: 0, order: null });
let session = freshSession();
function log(action, values = {}) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), action, ...values });
  console.log(line);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${line}\n`);
}
if (process.env.PERSIST_STATE === '1' && fs.existsSync(statePath)) {
  session = JSON.parse(fs.readFileSync(statePath, 'utf8'));
}
function refresh() { return refreshSession(session, products); }
function envelope() { return { products, session: refresh() }; }
function save(action, values = {}) {
  refresh();
  if (process.env.PERSIST_STATE === '1') {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(session, null, 2));
  }
  log(action, { ...values, subtotal: session.subtotal, discount: session.discount, total: session.total });
}
const app = express();
app.use(express.json());
const error = (res, status, message, ref) => res.status(status).json({ error: { message, ...(ref ? { ref } : {}) } });
function productFor(req, res) {
  const product = products.find(item => item.id === req.body?.productId);
  if (!product) error(res, 400, 'Choose a valid product.');
  return product;
}
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/state', (req, res) => res.json(envelope()));
app.get('/api/debug/state', (req, res) => res.json(refresh()));
app.post('/api/debug/reset', (req, res) => {
  session = freshSession();
  save('session.reset');
  res.json(envelope());
});
app.post('/api/cart/add', (req, res) => {
  const product = productFor(req, res);
  if (!product) return;
  const item = session.cart.find(item => item.productId === product.id);
  if (item?.quantity === 99) return error(res, 400, 'Quantity cannot exceed 99.');
  if (item) item.quantity += 1;
  else session.cart.push({ productId: product.id, quantity: 1 });
  session.order = null;
  save('cart.add', { productId: product.id });
  res.json(envelope());
});
app.post('/api/cart/quantity', (req, res) => {
  const product = productFor(req, res);
  if (!product) return;
  const quantity = req.body.quantity;
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) return error(res, 400, 'Quantity must be a whole number from 0 to 99.');
  setQuantity(session, product.id, quantity);
  session.order = null;
  save('cart.quantity', { productId: product.id, quantity });
  res.json(envelope());
});
app.post('/api/coupon', (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (code !== 'WELCOME10') return error(res, 400, 'That promo code is not valid. Try WELCOME10.');
  refresh();
  if (!session.cart.length) return error(res, 400, 'Add an item before applying a promo code.');
  applyCoupon(session, code);
  save('coupon.apply', { code });
  res.json(envelope());
});
app.delete('/api/coupon', (req, res) => {
  session.coupon = null;
  save('coupon.remove');
  res.json(envelope());
});
app.post('/api/checkout', (req, res) => {
  refresh();
  const chargedAmount = session.total;
  const expectedAmount = session.subtotal - (session.coupon ? Math.round(session.subtotal * 0.1) : 0);
  log('checkout.attempt', { chargedAmount, expectedAmount, couponCode: session.coupon?.code ?? null });
  if (!session.cart.length) return error(res, 400, 'Your cart is empty. Add an item before checking out.');
  try {
    validatePayment(chargedAmount, expectedAmount);
  } catch (err) {
    log('checkout.failed', { chargedAmount, expectedAmount, couponCode: session.coupon?.code ?? null, stack: err.stack });
    return error(res, 500, 'Something went wrong. We couldn’t process your payment.', 'PAY-500');
  }
  session.order = createOrder(session, products);
  session.cart = [];
  session.coupon = null;
  save('checkout.completed', { orderId: session.order.id, chargedAmount });
  res.json(envelope());
});
app.use('/api', (req, res) => error(res, 404, 'That API endpoint was not found.'));
app.use(express.static(path.join(directory, 'dist')));
app.get('*', (req, res, next) => {
  if (path.extname(req.path)) return error(res, 404, 'That file was not found.');
  res.sendFile(path.join(directory, 'dist/index.html'), err => err && next(err));
});
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return error(res, 400, 'Request body must be valid JSON.');
  const status = err.status === 404 ? 404 : 500;
  log('request.failed', { status, path: req.path, stack: err.stack });
  error(res, status, status === 404 ? 'That page was not found.' : 'Something went wrong. Please try again.');
});
app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => log('server.started', { port: Number(process.env.PORT || 3000) }));
