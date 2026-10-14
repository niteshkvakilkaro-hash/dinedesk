import { useEffect, useMemo, useState } from 'react';
import { intlLocale } from '@/i18n/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTabParam } from '@/lib/urlParams';
import { AlertTriangle, History, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { PurchasesTab, SuppliersTab } from './PurchasingTabs';
import { Alert, Badge, Dialog, EmptyState, ErrorState, Field, SkeletonRows, Spinner, toast, Toggle } from '@/components/ui';

interface Item { id: number; name: string; unit: string; stock: string; low_stock_level: string; cost_per_unit: string | null; is_active: boolean; is_low: boolean; dishes?: number }
interface Movement { type: string; quantity: string; balance_after: string; unit_cost: string | null; note: string | null; order_id: number | null; at: string }
interface RecipeCategory { id: number; name: string; items: { id: number; name: string; variants: { id: number; name: string }[]; lines: { inventory_item_id: number; item_variant_id: number | null; quantity: string }[] }[] }

const UNITS = ['kg', 'g', 'l', 'ml', 'pcs'];
const qty = (v: string | number) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });

function useItems() {
  return useQuery({ queryKey: ['inventory'], queryFn: async () => (await api.get<{ items: Item[]; low: number; value: string }>('/tenant/inventory/items')).data });
}

function ItemDialog({ item, onClose }: { item: Item | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const it = item === 'new' ? null : item;
  const [form, setForm] = useState({ name: '', unit: 'kg', stock: '', low_stock_level: '', cost_per_unit: '', is_active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (item) setForm({ name: it?.name ?? '', unit: it?.unit ?? 'kg', stock: '', low_stock_level: it ? String(Number(it.low_stock_level)) : '', cost_per_unit: it?.cost_per_unit ?? '', is_active: it?.is_active ?? true });
    setErrors({});
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => {
      const body = { ...form, stock: form.stock === '' ? null : Number(form.stock), low_stock_level: form.low_stock_level === '' ? 0 : Number(form.low_stock_level), cost_per_unit: form.cost_per_unit === '' ? null : Number(form.cost_per_unit) };
      return it ? api.put(`/tenant/inventory/items/${it.id}`, body) : api.post('/tenant/inventory/items', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(t('common.saved'));
      onClose();
    },
    onError: (e) => setErrors(e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])) : { name: e.message }),
  });
  if (!item) return null;
  return (
    <Dialog open onClose={onClose} title={it ? t('inventory.edit', { name: it.name }) : t('inventory.add')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        <Field label={t('inventory.name')} hint={t('inventory.nameHint')} error={errors.name}>{(a) => <input {...a} className="field-input" maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-autofocus />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('inventory.unit')}>
            {(a) => (
              <select {...a} className="field-input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} disabled={!!it}>
                {UNITS.map((u) => <option key={u} value={u}>{t(`inventory.units.${u}`)}</option>)}
              </select>
            )}
          </Field>
          {!it && <Field label={t('inventory.opening')} optional error={errors.stock}>{(a) => <input {...a} type="number" min={0} step="0.001" className="field-input" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />}</Field>}
          <Field label={t('inventory.lowLevel')} hint={t('inventory.lowLevelHint')} error={errors.low_stock_level}>{(a) => <input {...a} type="number" min={0} step="0.001" className="field-input" value={form.low_stock_level} onChange={(e) => setForm({ ...form, low_stock_level: e.target.value })} />}</Field>
          <Field label={t('inventory.cost', { unit: form.unit })} optional error={errors.cost_per_unit}>{(a) => <input {...a} type="number" min={0} step="0.01" className="field-input" value={form.cost_per_unit} onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })} />}</Field>
        </div>
        {it && <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label={t('inventory.active')} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** Purchase (in), wastage (out) or a physical count; plus the history. */
function StockDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [type, setType] = useState<'purchase' | 'wastage' | 'count'>('purchase');
  const [form, setForm] = useState({ quantity: '', unit_cost: '', note: '' });
  const history = useQuery({ queryKey: ['inventory-moves', item?.id], queryFn: async () => (await api.get<Movement[]>(`/tenant/inventory/items/${item!.id}/movements`)).data, enabled: !!item });
  useEffect(() => setForm({ quantity: '', unit_cost: '', note: '' }), [item, type]);
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => api.post(`/tenant/inventory/items/${item!.id}/stock`, { type, quantity: Number(form.quantity), unit_cost: form.unit_cost === '' ? null : Number(form.unit_cost), note: form.note || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      void qc.invalidateQueries({ queryKey: ['inventory-moves'] });
      toast.success(t('inventory.updated'));
      setForm({ quantity: '', unit_cost: '', note: '' });
    },
    onError: (e) => toast.error(e.message),
  });
  if (!item) return null;
  return (
    <Dialog open onClose={onClose} title={t('inventory.stockOf', { name: item.name, stock: qty(item.stock), unit: item.unit })} wide>
      <div className="space-y-4">
        <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="radiogroup" aria-label={t('inventory.moveType')}>
          {(['purchase', 'wastage', 'count'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={type === k} onClick={() => setType(k)} className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${type === k ? 'bg-surface shadow' : 'text-muted'}`}>{t(`inventory.move.${k}`)}</button>
          ))}
        </div>
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <input className="field-input" type="number" min={0} step="0.001" inputMode="decimal" aria-label={type === 'count' ? t('inventory.counted', { unit: item.unit }) : t('inventory.qty', { unit: item.unit })} placeholder={type === 'count' ? t('inventory.counted', { unit: item.unit }) : t('inventory.qty', { unit: item.unit })} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} data-autofocus />
          {type === 'purchase' ? <input className="field-input" type="number" min={0} step="0.01" aria-label={t('inventory.cost', { unit: item.unit })} placeholder={t('inventory.cost', { unit: item.unit })} value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} /> : <span />}
          <input className="field-input" maxLength={200} aria-label={t('inventory.note')} placeholder={t('inventory.note')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button type="submit" className="btn-primary" disabled={form.quantity === '' || save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button>
        </form>
        <h3 className="flex items-center gap-2 font-bold"><History className="h-4 w-4" aria-hidden="true" /> {t('inventory.history')}</h3>
        <ul className="max-h-72 divide-y divide-line overflow-y-auto text-sm">
          {(history.data ?? []).map((m, i) => (
            <li key={i} className="flex items-center gap-3 py-2">
              <Badge tone={Number(m.quantity) < 0 ? 'pending' : 'paid'}>{t(`inventory.types.${m.type}`)}</Badge>
              <span className="flex-1 truncate text-muted">{m.note}</span>
              <span className={`tabular-nums font-semibold ${Number(m.quantity) < 0 ? 'text-danger' : 'text-success'}`}>{Number(m.quantity) > 0 ? '+' : ''}{qty(m.quantity)}</span>
              <span className="w-20 text-right tabular-nums text-muted">{qty(m.balance_after)}</span>
              <span className="w-28 text-right text-xs text-muted">{new Intl.DateTimeFormat(intlLocale(i18n.language), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(m.at))}</span>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

function StockTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useItems();
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [moving, setMoving] = useState<Item | null>(null);
  const [onlyLow, setOnlyLow] = useState(false);
  const remove = useMutation<unknown, ApiError, number>({
    mutationFn: (id) => api.delete(`/tenant/inventory/items/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inventory'] }),
    onError: (e) => toast.error(e.message),
  });
  if (q.isLoading) return <SkeletonRows rows={5} />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />;
  const d = q.data!;
  const items = d.items.filter((i) => !onlyLow || i.is_low);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" /> {t('inventory.add')}</button>
        <button type="button" aria-pressed={onlyLow} onClick={() => setOnlyLow(!onlyLow)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${onlyLow ? 'border-ink bg-ink text-paper' : 'border-line'}`}>{t('inventory.onlyLow', { count: d.low })}</button>
        <p className="ml-auto text-sm text-muted">{t('inventory.value', { value: formatMoney(d.value) })}</p>
      </div>
      {d.low > 0 && <Alert tone="warn">{t('inventory.lowAlert', { count: d.low })}</Alert>}
      {!d.items.length ? (
        <EmptyState title={t('inventory.emptyTitle')}>{t('inventory.emptyText')}</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted">
              <tr><th className="p-3">{t('inventory.name')}</th><th className="p-3 text-right">{t('inventory.inStock')}</th><th className="p-3 text-right">{t('inventory.lowLevel')}</th><th className="p-3 text-right">{t('inventory.costShort')}</th><th className="p-3">{t('inventory.usedIn')}</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((i) => (
                <tr key={i.id} className={i.is_active ? '' : 'opacity-50'}>
                  <td className="p-3 font-semibold">{i.name} {i.is_low && <Badge tone="pending"><AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />{t('inventory.low')}</Badge>}</td>
                  <td className={`p-3 text-right tabular-nums font-bold ${Number(i.stock) < 0 ? 'text-danger' : ''}`}>{qty(i.stock)} {i.unit}</td>
                  <td className="p-3 text-right tabular-nums text-muted">{Number(i.low_stock_level) > 0 ? `${qty(i.low_stock_level)} ${i.unit}` : '—'}</td>
                  <td className="p-3 text-right tabular-nums text-muted">{i.cost_per_unit ? `${formatMoney(i.cost_per_unit)}/${i.unit}` : '—'}</td>
                  <td className="p-3 text-muted">{t('inventory.dishes', { count: i.dishes ?? 0 })}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <button type="button" className="btn-outline !min-h-9 !px-3 text-xs" onClick={() => setMoving(i)}>{t('inventory.stockBtn')}</button>
                      <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={() => setEditing(i)} aria-label={t('inventory.edit', { name: i.name })}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                      <button type="button" className="btn-ghost !min-h-9 !px-2 text-danger" onClick={() => remove.mutate(i.id)} aria-label={t('inventory.remove', { name: i.name })}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ItemDialog item={editing} onClose={() => setEditing(null)} />
      <StockDialog item={moving ? d.items.find((x) => x.id === moving.id) ?? moving : null} onClose={() => setMoving(null)} />
    </div>
  );
}

function RecipesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const items = useItems();
  const menu = useQuery({ queryKey: ['recipes'], queryFn: async () => (await api.get<RecipeCategory[]>('/tenant/inventory/recipes')).data });
  const dishes = useMemo(() => (menu.data ?? []).flatMap((c) => c.items.map((i) => ({ ...i, category: c.name }))), [menu.data]);
  const [dishId, setDishId] = useState<number | null>(null);
  const dish = dishes.find((d) => d.id === dishId) ?? null;
  const [lines, setLines] = useState<{ inventory_item_id: number | ''; item_variant_id: number | null; quantity: string }[]>([]);
  useEffect(() => setLines(dish ? dish.lines.map((l) => ({ inventory_item_id: l.inventory_item_id, item_variant_id: l.item_variant_id, quantity: String(Number(l.quantity)) })) : []), [dishId, menu.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => api.put(`/tenant/inventory/recipes/${dishId}`, { lines: lines.filter((l) => l.inventory_item_id && Number(l.quantity) > 0).map((l) => ({ ...l, quantity: Number(l.quantity) })) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recipes'] });
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(t('inventory.recipeSaved'));
    },
    onError: (e) => toast.error(e.message),
  });
  if (menu.isLoading || items.isLoading) return <SkeletonRows rows={5} />;
  const stock = items.data?.items ?? [];
  if (!stock.length) return <EmptyState title={t('inventory.emptyTitle')}>{t('inventory.recipesNeedItems')}</EmptyState>;
  const unitOf = (id: number | '') => stock.find((s) => s.id === id)?.unit ?? '';
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
      <ul className="card max-h-[70vh] divide-y divide-line overflow-y-auto">
        {dishes.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => setDishId(d.id)} aria-pressed={dishId === d.id} className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm ${dishId === d.id ? 'bg-ink text-paper' : 'hover:bg-ink/5'}`}>
              <span><span className="block font-semibold">{d.name}</span><span className="text-xs opacity-70">{d.category}</span></span>
              {d.lines.length > 0 && <Badge tone="paid">{d.lines.length}</Badge>}
            </button>
          </li>
        ))}
      </ul>
      {dish ? (
        <section className="card space-y-4 p-5">
          <div>
            <h2 className="text-lg font-bold">{dish.name}</h2>
            <p className="text-sm text-muted">{t('inventory.recipeHint')}</p>
          </div>
          <ul className="space-y-2">
            {lines.map((l, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <select className="field-input !w-56 !py-2" aria-label={t('inventory.ingredient')} value={l.inventory_item_id} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, inventory_item_id: e.target.value ? Number(e.target.value) : '' } : x)))}>
                  <option value="">{t('inventory.ingredient')}</option>
                  {stock.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input className="field-input !w-28 !py-2" type="number" min={0} step="0.001" aria-label={t('inventory.perServing')} value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                <span className="w-10 text-sm text-muted">{unitOf(l.inventory_item_id)}</span>
                {dish.variants.length > 0 && (
                  <select className="field-input !w-40 !py-2" aria-label={t('inventory.forSize')} value={l.item_variant_id ?? ''} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, item_variant_id: e.target.value ? Number(e.target.value) : null } : x)))}>
                    <option value="">{t('inventory.everySize')}</option>
                    {dish.variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                )}
                <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={t('common.remove')}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => setLines([...lines, { inventory_item_id: '', item_variant_id: null, quantity: '' }])}><Plus className="h-4 w-4" aria-hidden="true" /> {t('inventory.addIngredient')}</button>
          <div className="flex justify-end"><button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Spinner /> : t('inventory.saveRecipe')}</button></div>
        </section>
      ) : (
        <p className="card p-5 text-sm text-muted">{t('inventory.pickDish')}</p>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(['stock', 'recipes', 'purchases', 'suppliers'] as const, 'stock');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight"><Package className="h-7 w-7" aria-hidden="true" /> {t('inventory.title')}</h1>
          <p className="text-muted">{t('inventory.subtitle')}</p>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-ink/5 p-1" role="tablist">
          {(['stock', 'recipes', 'purchases', 'suppliers'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-surface shadow' : 'text-muted'}`}>{t(`inventory.tab.${k}`)}</button>
          ))}
        </div>
      </div>
      {tab === 'stock' ? <StockTab /> : tab === 'recipes' ? <RecipesTab /> : tab === 'purchases' ? <PurchasesTab /> : <SuppliersTab />}
    </div>
  );
}
