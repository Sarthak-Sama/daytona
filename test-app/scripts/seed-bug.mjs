const base = process.env.BASE_URL || 'http://localhost:3000';
async function post(path, body = {}) {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(value));
  return value;
}
await post('/api/debug/reset');
await post('/api/cart/add', { productId: 'tray' });
await post('/api/coupon', { code: 'WELCOME10' });
const state = await post('/api/cart/quantity', { productId: 'tray', quantity: 2 });
console.log(`Demo prepared at ${base}. Open checkout and pay. Subtotal: ¥${state.session.subtotal}; saved discount: ¥${state.session.discount}; displayed total: ¥${state.session.total}.`);
