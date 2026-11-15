export function refreshSession(session, products) {
  session.subtotal = session.cart.reduce((sum, item) => sum + products.find(product => product.id === item.productId).price * item.quantity, 0);
  if (session.cart.length === 0) session.coupon = null;
  session.discount = session.coupon?.discountAmount ?? 0;
  session.total = session.subtotal - session.discount;
  return session;
}

export function applyCoupon(session, code) {
  session.coupon = { code, discountAmount: Math.round(session.subtotal * 0.1) };
}

export function setQuantity(session, productId, quantity) {
  const item = session.cart.find(item => item.productId === productId);
  if (quantity === 0) session.cart = session.cart.filter(item => item.productId !== productId);
  else if (item) item.quantity = quantity;
  else session.cart.push({ productId, quantity });
}
