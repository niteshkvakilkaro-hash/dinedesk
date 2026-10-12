import type { CustomerOrder } from '../types';

export interface Estimate {
  /** ready = ready to collect / serve; arrive = at the door (delivery). */
  kind: 'ready' | 'arrive';
  at: Date;
  /** The estimate has passed but the order hasn't moved on yet. */
  late: boolean;
}

/**
 * A rough "ready by" time from the restaurant's own prep and delivery times (set in Ordering
 * settings), counted from when the order was confirmed (or placed, while it waits). Nothing is
 * shown for scheduled orders (they show their slot), unpaid online orders, or finished ones.
 */
export function orderEstimate(
  order: Pick<CustomerOrder, 'type' | 'status' | 'placed_at' | 'scheduled_for' | 'timeline' | 'payment_method' | 'payment_status'>,
  prepMinutes: number,
  deliveryMinutes: number,
  now = Date.now(),
): Estimate | null {
  if (order.scheduled_for || ['completed', 'cancelled'].includes(order.status)) return null;
  if (order.payment_method === 'online' && order.payment_status !== 'paid') return null;
  const at = (s: string) => order.timeline.find((e) => e.status === s)?.at;
  const plus = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60_000);
  const delivery = order.type === 'delivery';
  let when: Date;
  if (order.status === 'out_for_delivery') {
    when = plus(at('out_for_delivery') ?? order.placed_at, deliveryMinutes);
  } else if (order.status === 'ready') {
    if (!delivery) return null;
    when = plus(at('ready') ?? order.placed_at, deliveryMinutes);
  } else {
    const ready = plus(at('confirmed') ?? at('preparing') ?? order.placed_at, prepMinutes);
    when = delivery ? new Date(ready.getTime() + deliveryMinutes * 60_000) : ready;
  }
  return { kind: delivery ? 'arrive' : 'ready', at: when, late: now > when.getTime() };
}
