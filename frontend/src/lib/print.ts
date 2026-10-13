import { useSyncExternalStore } from 'react';
import { intlLocale } from '@/i18n/locale';

/**
 * Thermal printing (KOT and bills) through the browser's print dialog, laid out for 58 mm or
 * 80 mm roll printers. Works with any printer that has a normal driver. For one-click printing
 * without the dialog, start Chrome with --kiosk-printing and make the thermal printer the default.
 *
 * The printer belongs to the counter, not the business, so these settings live on this device.
 */
export interface PrinterPrefs {
  width: 58 | 80;
  /** Print a kitchen ticket whenever this device sends an order to the kitchen. */
  autoKot: boolean;
  /** Print the receipt as soon as a bill is fully paid on this device. */
  autoBill: boolean;
}

const KEY = 'dd_printer';
const DEFAULTS: PrinterPrefs = { width: 80, autoKot: false, autoBill: false };
const listeners = new Set<() => void>();
let cache: PrinterPrefs | null = null;

export function printerPrefs(): PrinterPrefs {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PrinterPrefs>;
    cache = { width: v.width === 58 ? 58 : 80, autoKot: !!v.autoKot, autoBill: !!v.autoBill };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function setPrinterPrefs(patch: Partial<PrinterPrefs>) {
  cache = { ...printerPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Private mode: kept until the page reloads.
  }
  listeners.forEach((l) => l());
}

export function usePrinterPrefs(): PrinterPrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    printerPrefs,
    () => DEFAULTS,
  );
}

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A complete page for the roll: narrow body, no margins, black on white, big enough to read. */
export function slipDocument(body: string, width: 58 | 80, title: string) {
  const inner = width === 58 ? 48 : 72; // printable width in mm
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: ${width}mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${inner}mm; margin: 0 auto; padding: 3mm 0 6mm; font: ${width === 58 ? 11 : 12}px/1.35 ui-monospace, 'Courier New', 'Noto Sans Devanagari', monospace; }
.c { text-align: center; } .r { text-align: right; } .b { font-weight: 700; } .big { font-size: 1.5em; font-weight: 800; } .sm { font-size: .85em; }
hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
table { width: 100%; border-collapse: collapse; } td { vertical-align: top; padding: .3mm 0; }
td.n { text-align: right; white-space: nowrap; padding-left: 1.5mm; }
.item { font-size: 1.15em; font-weight: 700; } .note { font-style: italic; }
</style></head><body>${body}</body></html>`;
}

/** Prints a slip from a hidden frame (the page itself is left alone). */
export function printSlip(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const win = frame.contentWindow!;
  const done = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener('afterprint', done, { once: true });
  // Let the frame lay out (and fonts settle) before printing.
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(() => frame.isConnected && frame.remove(), 60_000);
  }, 250);
}

export interface KotData {
  business: string;
  /** K-number from the kitchen display, when there is one. */
  kot?: number | null;
  order: number | null;
  type: string;
  table: string | null;
  at: Date;
  items: { quantity: number; name: string; detail?: string | null; notes?: string | null }[];
  notes?: string | null;
}

type T = (key: string, opts?: Record<string, unknown>) => string;

const clock = (d: Date, lang: string) =>
  new Intl.DateTimeFormat(intlLocale(lang), { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d);

/** Kitchen ticket: big quantities and names, notes underneath, no prices. */
export function kotSlip(k: KotData, t: T, lang: string) {
  const head = [k.kot ? `K-${k.kot}` : null, k.order ? `#${k.order}` : null].filter(Boolean).join(' · ');
  const rows = k.items
    .map(
      (i) =>
        `<tr><td class="item" style="width:9mm">${esc(i.quantity)}×</td><td class="item">${esc(i.name)}${i.detail ? `<div class="sm" style="font-weight:400">${esc(i.detail)}</div>` : ''}${i.notes ? `<div class="sm note" style="font-weight:400">“${esc(i.notes)}”</div>` : ''}</td></tr>`,
    )
    .join('');
  return `<div class="c b">${esc(t('print.kot'))}</div>
<div class="c big">${esc(head)}</div>
<div class="c b">${esc(k.table ? t('print.table', { table: k.table }) : t(`order.type.${k.type}`))}</div>
<div class="c sm">${esc(k.business)} · ${esc(clock(k.at, lang))}</div>
<hr><table>${rows}</table>${k.notes ? `<hr><div class="note">${esc(t('print.note'))}: ${esc(k.notes)}</div>` : ''}<hr>
<div class="c sm">${esc(t('print.items', { count: k.items.reduce((n, i) => n + i.quantity, 0) }))}</div>`;
}

export interface ReceiptBill {
  number: string;
  kind: 'tax_invoice' | 'bill';
  status: string;
  seller: { name: string; address: string; gstin: string | null; fssai: string | null; phone: string | null };
  buyer: { name: string | null; phone: string | null; gstin: string | null } | null;
  table: string | null;
  orders: { number: number }[];
  lines: { description: string; quantity: number; unit_price: string; total: string; tax_rate: string }[];
  items_total: string;
  discount: string;
  discount_reason: string | null;
  taxable_value: string;
  cgst: string;
  sgst: string;
  charges: string;
  round_off: string;
  total: string;
  paid: string;
  due: string;
  payments: { mode: string; amount: string; reference: string | null }[];
  prices_include_tax: boolean;
  issued_at: string;
  amount_in_words: string;
}

const rs = (v: string | number) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Customer receipt: the same figures as the GST invoice PDF, on a roll. */
export function receiptSlip(b: ReceiptBill, t: T, lang: string) {
  const s = b.seller;
  const row = (label: string, value: string, cls = '') => `<tr class="${cls}"><td>${esc(label)}</td><td class="n">${esc(value)}</td></tr>`;
  const lines = b.lines
    .map((l) => `<tr><td>${esc(l.description)}<div class="sm">${esc(l.quantity)} × ${rs(l.unit_price)}</div></td><td class="n">${rs(Number(l.unit_price) * l.quantity)}</td></tr>`)
    .join('');
  const half = (Number(b.lines[0]?.tax_rate ?? 0) / 2).toString();
  const sameRate = b.lines.every((l) => l.tax_rate === b.lines[0]?.tax_rate);
  return `<div class="c big">${esc(s.name)}</div>
${s.address ? `<div class="c sm">${esc(s.address)}</div>` : ''}${s.phone ? `<div class="c sm">${esc(t('print.phone'))}: ${esc(s.phone)}</div>` : ''}
${s.gstin ? `<div class="c sm">GSTIN: ${esc(s.gstin)}</div>` : ''}${s.fssai ? `<div class="c sm">FSSAI: ${esc(s.fssai)}</div>` : ''}
<hr><div class="c b">${esc(b.kind === 'tax_invoice' ? t('pos.taxInvoice') : t('pos.bill'))}</div>
<table>${row(t('print.billNo'), b.number)}${row(t('print.date'), clock(new Date(b.issued_at), lang))}${b.table ? row(t('print.tableLabel'), b.table) : ''}${b.orders.length ? row(t('print.orders'), b.orders.map((o) => `#${o.number}`).join(', ')) : ''}</table>
${b.buyer && (b.buyer.name || b.buyer.gstin) ? `<div class="sm">${esc(t('print.buyer'))}: ${esc([b.buyer.name, b.buyer.gstin ? `GSTIN ${b.buyer.gstin}` : null].filter(Boolean).join(' · '))}</div>` : ''}
<hr><table>${lines}</table><hr>
<table>${row(t('print.itemsTotal'), rs(b.items_total))}${Number(b.discount) > 0 ? row(t('print.discount'), `−${rs(b.discount)}`) : ''}${row(t('print.taxable'), rs(b.taxable_value))}${row(sameRate && b.lines.length ? `CGST ${half}%` : 'CGST', rs(b.cgst))}${row(sameRate && b.lines.length ? `SGST ${half}%` : 'SGST', rs(b.sgst))}${Number(b.charges) !== 0 ? row(t('print.charges'), rs(b.charges)) : ''}${Number(b.round_off) !== 0 ? row(t('print.roundOff'), rs(b.round_off)) : ''}</table>
<hr><table>${row(t('print.total'), `₹${rs(b.total)}`, 'big')}</table>
<div class="sm">${esc(b.amount_in_words)}</div>
${b.payments.length ? `<hr><table>${b.payments.map((p) => row(`${t(`pos.mode.${p.mode}`)}${p.reference ? ` · ${p.reference}` : ''}`, rs(p.amount))).join('')}${Number(b.due) > 0 ? row(t('print.due'), rs(b.due), 'b') : ''}</table>` : ''}
${b.status === 'void' ? `<hr><div class="c big">${esc(t('print.void'))}</div>` : ''}
<hr><div class="c">${esc(t('print.thanks'))}</div>`;
}
