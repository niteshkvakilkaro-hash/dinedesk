import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Download, Plus, Printer, QrCode, Trash2 } from 'lucide-react';
import { printerPrefs, printSlip, receiptSlip, slipDocument } from '@/lib/print';
import { upiLink, useQrCode } from '@/lib/upi';
import { api, ApiError, downloadFile } from '@/lib/api';
import { formatMoney as formatINR } from '@/lib/format';
import { Alert, Badge, Dialog, Field, Spinner, toast } from '@/components/ui';
import type { Bill, PayMode } from './api';
import { useFeature } from '@/hooks/useSession';

export type BillTarget = { title: string; orderIds?: number[]; sessionId?: number; invoiceId?: number };

const BASE_MODES: PayMode[] = ['cash', 'upi', 'card', 'other'];
const r2 = (n: number) => Math.round(n * 100) / 100;

function Totals({ bill }: { bill: Bill }) {
  const { t } = useTranslation();
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-4 ${strong ? 'border-t border-line pt-2 text-lg font-extrabold' : 'text-sm'}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
  return (
    <dl className="space-y-1">
      {row(t('pos.items'), formatINR(bill.items_total))}
      {Number(bill.discount) > 0 && row(`${t('pos.discount')}${bill.discount_reason ? ` (${bill.discount_reason})` : ''}`, `− ${formatINR(bill.discount)}`)}
      {row(t('pos.taxable'), formatINR(bill.taxable_value))}
      {row('CGST', formatINR(bill.cgst))}
      {row('SGST', formatINR(bill.sgst))}
      {Number(bill.charges) > 0 && row(t('pos.charges'), formatINR(bill.charges))}
      {Number(bill.round_off) !== 0 && row(t('pos.roundOff'), `${Number(bill.round_off) > 0 ? '+' : '−'} ${formatINR(Math.abs(Number(bill.round_off)))}`)}
      {row(t('order.total'), formatINR(bill.total), true)}
      {bill.payments.map((p, i) => (
        <div key={i} className="flex justify-between text-sm text-success">
          <dt>
            {t(`pos.mode.${p.mode}`)}
            {p.reference && p.mode !== 'online' ? ` · ${p.reference}` : ''}
          </dt>
          <dd className="tabular-nums">− {formatINR(p.amount)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A QR the guest scans to pay the amount due to the restaurant's UPI ID. */
function UpiQrPanel({ bill, onUse }: { bill: Bill; onUse: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const link = open && bill.upi ? upiLink({ vpa: bill.upi.vpa, payee: bill.upi.payee, amount: bill.due, note: bill.number }) : null;
  const qr = useQrCode(link, 280);
  if (!bill.upi) return null;
  if (!open) {
    return (
      <button type="button" className="btn-outline w-full" onClick={() => { setOpen(true); onUse(); }}>
        <QrCode className="h-4 w-4" aria-hidden="true" /> {t('pos.upiQr', { amount: formatINR(Number(bill.due)) })}
      </button>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white p-4 text-center text-[#14110f]">
      {qr && <img src={qr} alt={t('pos.upiQr', { amount: formatINR(Number(bill.due)) })} width={280} height={280} />}
      <p className="text-2xl font-extrabold tabular-nums">{formatINR(Number(bill.due))}</p>
      <p className="text-sm">{bill.upi.payee} · <span className="font-mono">{bill.upi.vpa}</span></p>
      <p className="text-xs text-[#5f574e]">{t('pos.upiQrHint')}</p>
      <button type="button" className="text-sm font-semibold underline" onClick={() => setOpen(false)}>{t('common.close')}</button>
    </div>
  );
}

/** Make the bill (discount, buyer GSTIN), take payment (split / mixed, cash change), print the invoice. */
export function BillDialog({ target, onClose, onDone }: { target: BillTarget | null; onClose: () => void; onDone?: (bill: Bill) => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [billId, setBillId] = useState<number | null>(null);
  const [disc, setDisc] = useState<{ type: 'none' | 'percent' | 'amount'; value: string; reason: string }>({ type: 'none', value: '', reason: '' });
  const [buyer, setBuyer] = useState({ name: '', phone: '', gstin: '' });
  const [showBuyer, setShowBuyer] = useState(false);
  const [rows, setRows] = useState<{ mode: PayMode; amount: string; reference: string }[]>([]);
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [error, setError] = useState('');
  const hasCoupons = useFeature('coupons');
  const hasLoyalty = useFeature('loyalty');
  const MODES: PayMode[] = hasLoyalty ? ['cash', 'upi', 'card', 'gift_card', 'other'] : BASE_MODES;
  const [coupon, setCoupon] = useState('');
  const [guest, setGuest] = useState<{ phone: string; found: { name: string; loyalty_points: number } | null | undefined; points: string }>({ phone: '', found: undefined, points: '' });

  useEffect(() => {
    setCoupon('');
    setGuest({ phone: '', found: undefined, points: '' });
    setBillId(target?.invoiceId ?? null);
    setDisc({ type: 'none', value: '', reason: '' });
    setBuyer({ name: '', phone: '', gstin: '' });
    setShowBuyer(false);
    setRows([]);
    setVoiding(false);
    setError('');
  }, [target]);

  const bill = useQuery({ queryKey: ['bill', billId], queryFn: async () => (await api.get<Bill>(`/tenant/bills/${billId}`)).data, enabled: !!billId });
  const b = bill.data;
  useEffect(() => {
    if (b && b.status === 'unpaid' && rows.length === 0) setRows([{ mode: 'cash', amount: b.due, reference: '' }]);
  }, [b]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    for (const k of ['pos-open', 'tables-live', 'orders', 'day-report', 'bills']) void qc.invalidateQueries({ queryKey: [k] });
  };
  const create = useMutation<{ data: Bill }, ApiError>({
    mutationFn: () =>
      api.post<Bill>('/tenant/bills', {
        session_id: target?.sessionId ?? null,
        order_ids: target?.orderIds ?? null,
        discount: disc.type === 'none' ? null : { type: disc.type, value: Number(disc.value) || 0, reason: disc.reason || null },
        buyer: showBuyer ? { name: buyer.name || null, phone: buyer.phone || null, gstin: buyer.gstin || null } : null,
        coupon_code: coupon.trim() || null,
        customer_phone: guest.found ? guest.phone : null,
        points: guest.found && Number(guest.points) > 0 ? Number(guest.points) : 0,
      }),
    onSuccess: (res) => {
      qc.setQueryData(['bill', res.data.id], res.data);
      setBillId(res.data.id);
      setError('');
      refresh();
    },
    onError: (e) => setError(e.errors ? Object.values(e.errors)[0][0] : e.message),
  });
  const pay = useMutation<{ data: Bill }, ApiError>({
    mutationFn: () => api.post<Bill>(`/tenant/bills/${billId}/pay`, { payments: rows.filter((r) => Number(r.amount) > 0).map((r) => ({ mode: r.mode, amount: Number(r.amount), reference: r.reference || null })) }),
    onSuccess: (res) => {
      qc.setQueryData(['bill', billId], res.data);
      toast.success(t('pos.paid', { number: res.data.number }));
      if (printerPrefs().autoBill) printReceipt(res.data);
      setError('');
      refresh();
      onDone?.(res.data);
    },
    onError: (e) => setError(e.message),
  });
  const cancel = useMutation<{ data: Bill }, ApiError>({
    mutationFn: () => api.post<Bill>(`/tenant/bills/${billId}/void`, { reason: voidReason }),
    onSuccess: () => {
      toast.success(t('pos.voided'));
      setBillId(null);
      setRows([]);
      setVoiding(false);
      refresh();
    },
    onError: (e) => setError(e.message),
  });

  if (!target) return null;
  const due = b ? Number(b.due) : 0;
  const entered = r2(rows.reduce((n, r) => n + (Number(r.amount) || 0), 0));
  const cash = rows.filter((r) => r.mode === 'cash').reduce((n, r) => n + (Number(r.amount) || 0), 0);
  const change = r2(Math.min(cash, Math.max(0, entered - due)));
  const short = r2(Math.max(0, due - entered));
  const splitEqually = (n: number) => {
    const share = Math.floor((due / n) * 100) / 100;
    setRows(Array.from({ length: n }, (_, i) => ({ mode: rows[i]?.mode ?? 'cash', amount: (i === n - 1 ? r2(due - share * (n - 1)) : share).toFixed(2), reference: '' })));
  };
  const printReceipt = (bill: Bill) => printSlip(slipDocument(receiptSlip(bill, t, i18n.language ?? 'en'), printerPrefs().width, bill.number));
  const download = () => b && void downloadFile(`/tenant/bills/${b.id}/pdf`, `${b.number.replace(/\//g, '-')}.pdf`).catch((e: Error) => toast.error(e.message));

  return (
    <Dialog open onClose={onClose} title={b ? `${b.kind === 'tax_invoice' ? t('pos.taxInvoice') : t('pos.bill')} ${b.number}` : target.title} wide>
      {!billId && (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <fieldset>
            <legend className="field-label">{t('pos.discount')}</legend>
            <div className="flex flex-wrap gap-2">
              {(['none', 'percent', 'amount'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={disc.type === k} onClick={() => setDisc({ ...disc, type: k })} className={`rounded-full border px-4 py-2 text-sm font-semibold ${disc.type === k ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                  {t(`pos.discountType.${k}`)}
                </button>
              ))}
            </div>
            {disc.type !== 'none' && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
                <input className="field-input" type="number" min={0} step="0.01" inputMode="decimal" aria-label={t('pos.discountValue')} placeholder={disc.type === 'percent' ? '10 %' : '₹ 50'} value={disc.value} onChange={(e) => setDisc({ ...disc, value: e.target.value })} />
                <input className="field-input" placeholder={t('pos.discountReason')} aria-label={t('pos.discountReason')} maxLength={200} value={disc.reason} onChange={(e) => setDisc({ ...disc, reason: e.target.value })} />
              </div>
            )}
          </fieldset>
          {(hasCoupons || hasLoyalty) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {hasCoupons && (
                <Field label={t('pos.coupon')} optional>{(a) => <input {...a} className="field-input font-mono uppercase" maxLength={30} value={coupon} onChange={(e) => setCoupon(e.target.value)} />}</Field>
              )}
              {hasLoyalty && (
                <div>
                  <span className="field-label">{t('pos.guestPoints')}</span>
                  <div className="flex gap-2">
                    <input className="field-input" type="tel" aria-label={t('pos.guestPhone')} placeholder={t('pos.guestPhone')} value={guest.phone} onChange={(e) => setGuest({ phone: e.target.value, found: undefined, points: '' })} />
                    <button type="button" className="btn-outline !min-h-11 shrink-0 text-sm" disabled={guest.phone.replace(/\D/g, '').length < 10} onClick={() => void api.get<{ name: string; loyalty_points: number } | null>('/tenant/customers/lookup', { phone: guest.phone }).then((r) => setGuest((g) => ({ ...g, found: r.data }))).catch((e: Error) => toast.error(e.message))}>
                      {t('pos.find')}
                    </button>
                  </div>
                  {guest.found === null && <p className="mt-1 text-sm text-muted">{t('pos.noGuest')}</p>}
                  {guest.found && (
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <span>{t('pos.guestHas', { name: guest.found.name, count: guest.found.loyalty_points })}</span>
                      <input className="field-input !w-24 !py-1.5" type="number" min={0} max={guest.found.loyalty_points} aria-label={t('pos.usePoints')} placeholder={t('pos.usePoints')} value={guest.points} onChange={(e) => setGuest({ ...guest, points: e.target.value })} />
                    </label>
                  )}
                </div>
              )}
            </div>
          )}
          <div>
            <button type="button" className="text-sm font-semibold underline" onClick={() => setShowBuyer(!showBuyer)} aria-expanded={showBuyer}>
              {t('pos.addBuyer')}
            </button>
            {showBuyer && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label={t('order.name')} optional>{(a) => <input {...a} className="field-input" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />}</Field>
                <Field label={t('order.phone')} optional>{(a) => <input {...a} className="field-input" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} />}</Field>
                <Field label="GSTIN" optional hint={t('pos.gstinHint')}>{(a) => <input {...a} className="field-input uppercase" maxLength={15} value={buyer.gstin} onChange={(e) => setBuyer({ ...buyer, gstin: e.target.value })} />}</Field>
              </div>
            )}
          </div>
          {error && <Alert>{error}</Alert>}
          <button type="submit" className="btn-primary w-full" disabled={create.isPending} data-autofocus>
            {create.isPending ? <Spinner /> : t('pos.makeBill')}
          </button>
        </form>
      )}

      {billId && bill.isLoading && <Spinner />}
      {b && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone={b.status === 'paid' ? 'paid' : b.status === 'void' ? 'cancelled' : 'pending'}>{t(`pos.status.${b.status}`)}</Badge>
            {b.table && <span>{t('pos.tableLabel', { table: b.table })}</span>}
            <span>{t('pos.ordersLabel', { list: b.orders.map((o) => `#${o.number}`).join(', ') })}</span>
            {b.buyer?.gstin && <span>GSTIN {b.buyer.gstin}</span>}
          </div>
          <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line text-sm">
            {b.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3 px-3 py-2">
                <span>
                  {l.quantity} × {l.description} <span className="text-muted">· {Number(l.tax_rate)}%</span>
                </span>
                <span className="tabular-nums">{formatINR(l.total)}</span>
              </li>
            ))}
          </ul>
          <Totals bill={b} />
          <p className="text-xs text-muted">{b.amount_in_words}</p>

          {b.status === 'unpaid' && (
            <div className="space-y-3 rounded-2xl bg-ink/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">{t('pos.takePayment', { amount: formatINR(b.due) })}</p>
                <div className="flex gap-1 text-sm">
                  {[2, 3, 4].map((n) => (
                    <button key={n} type="button" className="rounded-full border border-line px-3 py-1 font-semibold" onClick={() => splitEqually(n)}>
                      {t('pos.splitN', { count: n })}
                    </button>
                  ))}
                </div>
              </div>
              {rows.map((row, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-1" role="radiogroup" aria-label={t('pos.payMode')}>
                    {MODES.map((m) => (
                      <button key={m} type="button" role="radio" aria-checked={row.mode === m} onClick={() => setRows(rows.map((r, j) => (j === i ? { ...r, mode: m } : r)))} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${row.mode === m ? 'border-ink bg-ink text-paper' : 'border-line bg-surface'}`}>
                        {t(`pos.mode.${m}`)}
                      </button>
                    ))}
                  </div>
                  <input className="field-input !w-32 !py-2 tabular-nums" type="number" min={0} step="0.01" inputMode="decimal" aria-label={t('pos.amount')} value={row.amount} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))} />
                  {row.mode !== 'cash' && <input className={`field-input !py-2 ${row.mode === 'gift_card' ? '!w-56 font-mono uppercase' : '!w-40'}`} placeholder={row.mode === 'gift_card' ? t('pos.giftCardCode') : t('pos.reference')} aria-label={row.mode === 'gift_card' ? t('pos.giftCardCode') : t('pos.reference')} value={row.reference} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, reference: e.target.value } : r)))} />}
                  {rows.length > 1 && (
                    <button type="button" className="btn-ghost !min-h-10 !px-2" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={t('common.remove')}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold underline" onClick={() => setRows([...rows, { mode: 'upi', amount: short ? short.toFixed(2) : '', reference: '' }])}>
                <Plus className="h-4 w-4" aria-hidden="true" /> {t('pos.addPayment')}
              </button>
              <p className="text-sm font-semibold" aria-live="polite">
                {short > 0 ? t('pos.short', { amount: formatINR(short) }) : change > 0 ? t('pos.change', { amount: formatINR(change) }) : t('pos.exact')}
              </p>
              {error && <Alert>{error}</Alert>}
              {b.upi && <UpiQrPanel bill={b} onUse={() => setRows([{ mode: 'upi', amount: b.due, reference: '' }])} />}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary flex-1" disabled={pay.isPending || short > 0} onClick={() => pay.mutate()}>
                  {pay.isPending ? <Spinner /> : t('pos.confirmPayment')}
                </button>
                <button type="button" className="btn-outline" onClick={() => printReceipt(b)}>
                  <Printer className="h-4 w-4" aria-hidden="true" /> {t('print.print')}
                </button>
                <button type="button" className="btn-outline" onClick={download}>
                  <Download className="h-4 w-4" aria-hidden="true" /> PDF
                </button>
              </div>
              {voiding ? (
                <div className="flex flex-wrap gap-2">
                  <input className="field-input flex-1" placeholder={t('pos.voidReason')} aria-label={t('pos.voidReason')} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
                  <button type="button" className="btn-outline" disabled={voidReason.trim().length < 3 || cancel.isPending} onClick={() => cancel.mutate()}>
                    {t('pos.voidYes')}
                  </button>
                </div>
              ) : (
                <button type="button" className="text-sm text-danger underline" onClick={() => setVoiding(true)}>
                  {t('pos.void')}
                </button>
              )}
            </div>
          )}
          {b.status === 'paid' && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-success-soft p-4 text-success">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              <p className="flex-1 font-bold">{t('pos.paidFull')}</p>
              <button type="button" className="btn-outline !min-h-10 bg-surface text-sm text-ink" onClick={() => printReceipt(b)}>
                <Printer className="h-4 w-4" aria-hidden="true" /> {t('print.print')}
              </button>
              <button type="button" className="btn-outline !min-h-10 bg-surface text-sm text-ink" onClick={download}>
                <Download className="h-4 w-4" aria-hidden="true" /> {t('pos.downloadInvoice')}
              </button>
            </div>
          )}
          {b.status === 'void' && <Alert tone="warn">{t('pos.voidedNote', { reason: b.void_reason })}</Alert>}
        </div>
      )}
    </Dialog>
  );
}
