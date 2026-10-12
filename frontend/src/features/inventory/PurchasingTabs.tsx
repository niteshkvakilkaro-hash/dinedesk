import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MessageCircle, PackageCheck, Pencil, Plus, Sparkles, Trash2, Truck, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Badge, Dialog, EmptyState, ErrorState, Field, SkeletonRows, Spinner, toast, Toggle } from '@/components/ui';

interface Supplier { id: number; name: string; phone: string | null; email: string | null; gstin: string | null; notes: string | null; is_active: boolean }
interface PoLine { id?: number; inventory_item_id: number; name?: string | null; unit?: string | null; quantity: string | number; unit_cost: string | number | null; received_quantity?: string | null }
interface Po { id: number; code: string; status: 'draft' | 'sent' | 'received' | 'cancelled'; supplier: { id: number; name: string; phone: string | null } | null; expected_on: string | null; notes: string | null; total: string; sent_at: string | null; received_at: string | null; created_at: string; lines: PoLine[]; message: string }
interface Suggestion { inventory_item_id: number; name: string; unit: string; stock: string; quantity: number; unit_cost: string | null }
interface StockItem { id: number; name: string; unit: string; cost_per_unit: string | null; is_active: boolean }

const TONE: Record<Po['status'], string> = { draft: 'pending', sent: 'confirmed', received: 'completed', cancelled: 'cancelled' };
const qty = (v: string | number) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });

/** wa.me wants the number with the country code. */
function waLink(phone: string | null | undefined, text: string) {
  const digits = (phone ?? '').replace(/\D+/g, '');
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

function useSuppliers() {
  return useQuery({ queryKey: ['suppliers'], queryFn: async () => (await api.get<Supplier[]>('/tenant/inventory/suppliers')).data });
}

function errorsOf(e: ApiError, fallback: string) {
  return e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])) : { [fallback]: e.message };
}

function SupplierDialog({ supplier, onClose }: { supplier: Supplier | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const s = supplier === 'new' ? null : supplier;
  const [form, setForm] = useState({ name: '', phone: '', email: '', gstin: '', notes: '', is_active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (supplier) setForm({ name: s?.name ?? '', phone: s?.phone ?? '', email: s?.email ?? '', gstin: s?.gstin ?? '', notes: s?.notes ?? '', is_active: s?.is_active ?? true });
    setErrors({});
  }, [supplier]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => {
      const body = { ...form, phone: form.phone || null, email: form.email || null, gstin: form.gstin || null, notes: form.notes || null };
      return s ? api.put(`/tenant/inventory/suppliers/${s.id}`, body) : api.post('/tenant/inventory/suppliers', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(t('common.saved'));
      onClose();
    },
    onError: (e) => setErrors(errorsOf(e, 'name')),
  });
  if (!supplier) return null;
  return (
    <Dialog open onClose={onClose} title={s ? t('purchasing.editSupplier', { name: s.name }) : t('purchasing.addSupplier')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        <Field label={t('purchasing.supplierName')} error={errors.name}>{(a) => <input {...a} className="field-input" maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-autofocus />}</Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('purchasing.phone')} hint={t('purchasing.phoneHint')} optional error={errors.phone}>{(a) => <input {...a} type="tel" inputMode="tel" className="field-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}</Field>
          <Field label={t('purchasing.email')} optional error={errors.email}>{(a) => <input {...a} type="email" className="field-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
          <Field label="GSTIN" optional error={errors.gstin}>{(a) => <input {...a} className="field-input uppercase" maxLength={15} value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />}</Field>
          <Field label={t('purchasing.notes')} optional error={errors.notes}>{(a) => <input {...a} className="field-input" maxLength={300} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
        </div>
        {s && <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label={t('purchasing.active')} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function SuppliersTab() {
  const { t } = useTranslation();
  const q = useSuppliers();
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  if (q.isLoading) return <SkeletonRows rows={4} />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />;
  const list = q.data!;
  return (
    <div className="space-y-4">
      <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" /> {t('purchasing.addSupplier')}</button>
      {!list.length ? (
        <EmptyState title={t('purchasing.noSuppliers')}>{t('purchasing.noSuppliersText')}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => (
            <div key={s.id} className={`card p-4 ${s.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{s.name}</p>
                  {s.phone && <p className="text-sm text-muted">{s.phone}</p>}
                  {s.gstin && <p className="text-xs text-muted">GSTIN {s.gstin}</p>}
                  {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}
                </div>
                <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={() => setEditing(s)} aria-label={t('purchasing.editSupplier', { name: s.name })}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <SupplierDialog supplier={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function OrderDialog({ order, onClose }: { order: Po | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const po = order === 'new' ? null : order;
  const suppliers = useSuppliers();
  const items = useQuery({ queryKey: ['inventory'], queryFn: async () => (await api.get<{ items: StockItem[] }>('/tenant/inventory/items')).data, enabled: !!order });
  const [form, setForm] = useState<{ supplier_id: string; expected_on: string; notes: string; lines: PoLine[] }>({ supplier_id: '', expected_on: '', notes: '', lines: [] });
  const [error, setError] = useState('');
  useEffect(() => {
    if (order) setForm({ supplier_id: po?.supplier ? String(po.supplier.id) : '', expected_on: po?.expected_on ?? '', notes: po?.notes ?? '', lines: po?.lines.map((l) => ({ inventory_item_id: l.inventory_item_id, quantity: String(Number(l.quantity)), unit_cost: l.unit_cost ?? '' })) ?? [] });
    setError('');
  }, [order]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggest = useMutation<Suggestion[], ApiError>({
    mutationFn: async () => (await api.get<Suggestion[]>('/tenant/inventory/purchase-orders/suggestions')).data,
    onSuccess: (list) => {
      if (!list.length) return toast.success(t('purchasing.nothingLow'));
      const have = new Set(form.lines.map((l) => l.inventory_item_id));
      setForm({ ...form, lines: [...form.lines, ...list.filter((s) => !have.has(s.inventory_item_id)).map((s) => ({ inventory_item_id: s.inventory_item_id, quantity: String(s.quantity), unit_cost: s.unit_cost ?? '' }))] });
    },
  });
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => {
      const body = {
        supplier_id: Number(form.supplier_id) || null,
        expected_on: form.expected_on || null,
        notes: form.notes || null,
        lines: form.lines.filter((l) => l.inventory_item_id).map((l) => ({ inventory_item_id: l.inventory_item_id, quantity: Number(l.quantity), unit_cost: l.unit_cost === '' || l.unit_cost === null ? null : Number(l.unit_cost) })),
      };
      return po ? api.put(`/tenant/inventory/purchase-orders/${po.id}`, body) : api.post('/tenant/inventory/purchase-orders', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success(t('common.saved'));
      onClose();
    },
    onError: (e) => setError(e.errors ? Object.values(e.errors)[0][0] : e.message),
  });
  if (!order) return null;
  const stock = (items.data?.items ?? []).filter((i) => i.is_active);
  const unitOf = (id: number) => stock.find((i) => i.id === id)?.unit ?? '';
  const setLine = (n: number, patch: Partial<PoLine>) => setForm({ ...form, lines: form.lines.map((l, i) => (i === n ? { ...l, ...patch } : l)) });
  const total = form.lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_cost || 0), 0);
  return (
    <Dialog open onClose={onClose} title={po ? t('purchasing.editOrder', { code: po.code }) : t('purchasing.newOrder')} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('purchasing.supplier')}>
            {(a) => (
              <select {...a} className="field-input" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">{t('purchasing.pickSupplier')}</option>
                {(suppliers.data ?? []).filter((s) => s.is_active || String(s.id) === form.supplier_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </Field>
          <Field label={t('purchasing.expectedOn')} optional>{(a) => <input {...a} type="date" className="field-input" value={form.expected_on} onChange={(e) => setForm({ ...form, expected_on: e.target.value })} />}</Field>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{t('purchasing.items')}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost !min-h-9 text-sm" onClick={() => suggest.mutate()} disabled={suggest.isPending}><Sparkles className="h-4 w-4" aria-hidden="true" /> {t('purchasing.suggest')}</button>
              <button type="button" className="btn-ghost !min-h-9 text-sm" onClick={() => setForm({ ...form, lines: [...form.lines, { inventory_item_id: 0, quantity: '', unit_cost: '' }] })}><Plus className="h-4 w-4" aria-hidden="true" /> {t('purchasing.addLine')}</button>
            </div>
          </div>
          {!form.lines.length && <p className="rounded-xl bg-ink/5 p-3 text-sm text-muted">{t('purchasing.noLines')}</p>}
          {form.lines.map((l, n) => (
            <div key={n} className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_7rem_7rem_auto]">
              <select className="field-input col-span-2 sm:col-span-1" aria-label={t('purchasing.item')} value={l.inventory_item_id || ''} onChange={(e) => {
                const id = Number(e.target.value);
                setLine(n, { inventory_item_id: id, unit_cost: l.unit_cost === '' ? stock.find((i) => i.id === id)?.cost_per_unit ?? '' : l.unit_cost });
              }}>
                <option value="">{t('purchasing.pickItem')}</option>
                {stock.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
              <input type="number" min={0} step="0.001" className="field-input" aria-label={t('purchasing.qty')} placeholder={`${t('purchasing.qty')} ${unitOf(l.inventory_item_id)}`} value={l.quantity} onChange={(e) => setLine(n, { quantity: e.target.value })} />
              <input type="number" min={0} step="0.01" className="field-input" aria-label={t('purchasing.rate')} placeholder={t('purchasing.rate')} value={l.unit_cost ?? ''} onChange={(e) => setLine(n, { unit_cost: e.target.value })} />
              <button type="button" className="btn-ghost !min-h-11 !px-2" onClick={() => setForm({ ...form, lines: form.lines.filter((_, i) => i !== n) })} aria-label={t('common.remove')}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
            </div>
          ))}
        </div>
        <Field label={t('purchasing.notes')} optional>{(a) => <input {...a} className="field-input" maxLength={300} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
        {error && <p className="text-sm font-semibold text-danger" role="alert">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">{t('purchasing.estimate', { total: formatMoney(total) })}</p>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

/** What actually arrived (and at what price) goes into stock. */
function ReceiveDialog({ order, onClose }: { order: Po | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [lines, setLines] = useState<Record<number, { received: string; unit_cost: string }>>({});
  useEffect(() => {
    if (order) setLines(Object.fromEntries(order.lines.map((l) => [l.id!, { received: String(Number(l.quantity)), unit_cost: l.unit_cost ? String(Number(l.unit_cost)) : '' }])));
  }, [order]);
  const receive = useMutation<unknown, ApiError>({
    mutationFn: () => api.post(`/tenant/inventory/purchase-orders/${order!.id}/receive`, {
      lines: Object.entries(lines).map(([id, l]) => ({ id: Number(id), received: Number(l.received || 0), unit_cost: l.unit_cost === '' ? null : Number(l.unit_cost) })),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(t('purchasing.receivedToast'));
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  if (!order) return null;
  return (
    <Dialog open onClose={onClose} title={t('purchasing.receiveTitle', { code: order.code })} wide>
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('purchasing.receiveHint')}</p>
        {order.lines.map((l) => (
          <div key={l.id} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_8rem_8rem]">
            <p className="col-span-2 font-semibold sm:col-span-1">{l.name} <span className="text-sm font-normal text-muted">({t('purchasing.ordered', { qty: qty(l.quantity), unit: l.unit })})</span></p>
            <label className="text-xs font-semibold text-muted">{t('purchasing.arrived', { unit: l.unit })}
              <input type="number" min={0} step="0.001" className="field-input mt-1" value={lines[l.id!]?.received ?? ''} onChange={(e) => setLines({ ...lines, [l.id!]: { ...lines[l.id!], received: e.target.value } })} />
            </label>
            <label className="text-xs font-semibold text-muted">{t('purchasing.paidRate', { unit: l.unit })}
              <input type="number" min={0} step="0.01" className="field-input mt-1" value={lines[l.id!]?.unit_cost ?? ''} onChange={(e) => setLines({ ...lines, [l.id!]: { ...lines[l.id!], unit_cost: e.target.value } })} />
            </label>
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn-primary" onClick={() => receive.mutate()} disabled={receive.isPending}>{receive.isPending ? <Spinner /> : <><PackageCheck className="h-4 w-4" aria-hidden="true" /> {t('purchasing.receive')}</>}</button>
        </div>
      </div>
    </Dialog>
  );
}

export function PurchasesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['purchase-orders'], queryFn: async () => (await api.get<Po[]>('/tenant/inventory/purchase-orders')).data });
  const suppliers = useSuppliers();
  const [editing, setEditing] = useState<Po | 'new' | null>(null);
  const [receiving, setReceiving] = useState<Po | null>(null);
  const act = useMutation<unknown, ApiError, { id: number; action: 'send' | 'cancel' }>({
    mutationFn: ({ id, action }) => api.post(`/tenant/inventory/purchase-orders/${id}/${action}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
    onError: (e) => toast.error(e.message),
  });
  if (q.isLoading) return <SkeletonRows rows={4} />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />;
  const list = q.data!;
  const noSuppliers = !suppliers.isLoading && !(suppliers.data ?? []).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => setEditing('new')} disabled={noSuppliers}><Plus className="h-4 w-4" aria-hidden="true" /> {t('purchasing.newOrder')}</button>
        {noSuppliers && <p className="text-sm text-muted">{t('purchasing.addSupplierFirst')}</p>}
      </div>
      {!list.length ? (
        <EmptyState title={t('purchasing.noOrders')}>{t('purchasing.noOrdersText')}</EmptyState>
      ) : (
        <div className="space-y-3">
          {list.map((po) => {
            const open = po.status === 'draft' || po.status === 'sent';
            return (
              <div key={po.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold">{po.code} <Badge tone={TONE[po.status]}>{t(`purchasing.status.${po.status}`)}</Badge></p>
                    <p className="text-sm text-muted">
                      {po.supplier?.name}
                      {po.expected_on && <> · {t('purchasing.neededBy', { date: new Date(po.expected_on).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) })}</>}
                    </p>
                  </div>
                  <p className="text-lg font-extrabold tabular-nums">{formatMoney(po.total)}</p>
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {po.lines.map((l) => (
                    <li key={l.id} className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold">
                      {l.name} · {po.status === 'received' ? `${qty(l.received_quantity ?? 0)}/${qty(l.quantity)}` : qty(l.quantity)} {l.unit}
                    </li>
                  ))}
                </ul>
                {open && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={waLink(po.supplier?.phone, po.message)} target="_blank" rel="noreferrer" className="btn-ghost !min-h-9 text-sm" onClick={() => po.status === 'draft' && act.mutate({ id: po.id, action: 'send' })}>
                      <MessageCircle className="h-4 w-4" aria-hidden="true" /> {t('purchasing.sendWhatsapp')}
                    </a>
                    {po.status === 'draft' && <button type="button" className="btn-ghost !min-h-9 text-sm" onClick={() => setEditing(po)}><Pencil className="h-4 w-4" aria-hidden="true" /> {t('common.edit')}</button>}
                    {po.status === 'draft' && <button type="button" className="btn-ghost !min-h-9 text-sm" onClick={() => act.mutate({ id: po.id, action: 'send' })}><Truck className="h-4 w-4" aria-hidden="true" /> {t('purchasing.markSent')}</button>}
                    <button type="button" className="btn-primary !min-h-9 text-sm" onClick={() => setReceiving(po)}><PackageCheck className="h-4 w-4" aria-hidden="true" /> {t('purchasing.receive')}</button>
                    <button type="button" className="btn-ghost !min-h-9 text-sm text-danger" onClick={() => window.confirm(t('purchasing.cancelConfirm', { code: po.code })) && act.mutate({ id: po.id, action: 'cancel' })}><X className="h-4 w-4" aria-hidden="true" /> {t('purchasing.cancel')}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <OrderDialog order={editing} onClose={() => setEditing(null)} />
      <ReceiveDialog order={receiving} onClose={() => setReceiving(null)} />
    </div>
  );
}
