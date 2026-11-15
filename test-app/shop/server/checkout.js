import { randomUUID } from 'node:crypto';

export function validatePayment(chargedAmount, expectedAmount) {
  if (chargedAmount !== expectedAmount) throw new Error('Payment amount validation failed');
}

export function createOrder(session, products) {
  return {
    id: `FF-${randomUUID()}`,
    items: session.cart.map(item => {
      const product = products.find(product => product.id === item.productId);
      return { productId: product.id, name: product.name, price: product.price, quantity: item.quantity };
    }),
    subtotal: session.subtotal,
    discount: session.discount,
    total: session.total,
    createdAt: new Date().toISOString(),
  };
}
