import { describe, expect, it } from 'vitest';
import { kotSlip, receiptSlip, slipDocument, type ReceiptBill } from './print';

const t = (key: string, o?: Record<string, unknown>) => (o ? `${key}:${JSON.stringify(o)}` : key);

describe('thermal slips', () => {
  it('sizes the page for the roll', () => {
    expect(slipDocument('x', 58, 'T')).toContain('size: 58mm auto');
    expect(slipDocument('x', 80, 'T')).toContain('width: 72mm');
  });

  it('prints the kitchen ticket without prices and escapes what staff typed', () => {
    const html = kotSlip({ business: 'Spice', kot: 12, order: 1042, type: 'dine_in', table: 'T4', at: new Date('2026-10-12T08:00:00Z'), notes: 'No <b>onion</b>', items: [{ quantity: 2, name: 'Dal', detail: 'Full', notes: 'less oil' }] }, t, 'en');
    expect(html).toContain('K-12 · #1042');
    expect(html).toContain('2×');
    expect(html).toContain('No &lt;b&gt;onion&lt;/b&gt;');
    expect(html).not.toContain('₹');
  });

  it('prints the GST receipt with CGST / SGST at half the rate each', () => {
    const bill: ReceiptBill = {
      number: 'INV/2026-27/0007', kind: 'tax_invoice', status: 'paid',
      seller: { name: 'Spice Route', address: 'MI Road, Jaipur', gstin: '08ABCDE1234F1Z5', fssai: null, phone: null },
      buyer: null, table: 'T4', orders: [{ number: 1042 }],
      lines: [{ description: 'Dal Makhani', quantity: 2, unit_price: '220.00', total: '462.00', tax_rate: '5.00' }],
      items_total: '440.00', discount: '0.00', discount_reason: null, taxable_value: '440.00', cgst: '11.00', sgst: '11.00', charges: '0.00', round_off: '0.00',
      total: '462.00', paid: '462.00', due: '0.00', payments: [{ mode: 'upi', amount: '462.00', reference: null }], prices_include_tax: false,
      issued_at: '2026-10-12T08:00:00Z', amount_in_words: 'Rupees four hundred sixty-two only',
    };
    const html = receiptSlip(bill, t, 'en');
    expect(html).toContain('GSTIN: 08ABCDE1234F1Z5');
    expect(html).toContain('CGST 2.5%');
    expect(html).toContain('₹462.00');
    expect(html).toContain('pos.mode.upi');
    expect(html).not.toContain('print.void');
  });
});
