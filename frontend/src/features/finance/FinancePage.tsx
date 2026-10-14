import { useState } from 'react';
import { intlLocale } from '@/i18n/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTabParam } from '@/lib/urlParams';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, Trash2, Wallet } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useThemeColors } from '@/lib/adminTheme';
import { Alert, Dialog, EmptyState, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';

const CATEGORIES = ['rent', 'salaries', 'utilities', 'gas', 'supplies', 'marketing', 'maintenance', 'other'] as const;
const MODES = ['cash', 'upi', 'card', 'bank'] as const;

interface Pnl {
  from: string;
  to: string;
  revenue: { total: string; restaurant: string; rooms: string; tiffin?: string };
  apps?: { app: 'swiggy' | 'zomato'; sales: string }[];
  food_cost: string;
  food_cost_percent: number | null;
  gross_profit: string;
  expenses: { total: string; by_category: { category: string; amount: string }[] };
  net_profit: string;
  margin_percent: number | null;
  series: { date: string; revenue: string; food_cost: string; expenses: string; profit: string }[];
  coverage: { dishes: number; with_recipe: number; ingredients_without_cost: number };
}
interface Expense {
  id: number;
  date: string;
  category: string;
  amount: string;
  payment_mode: string;
  note: string | null;
}
interface DishCost {
  id: number;
  name: string;
  size: string | null;
  category: string | null;
  price: string;
  cost: string | null;
  food_cost_percent: number | null;
  margin: string | null;
  missing_costs: number;
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** Profit and loss, expenses and dish costing (people who see reports). */
export default function FinancePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(['pnl', 'expenses', 'dishes'] as const, 'pnl');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <Wallet className="h-7 w-7" aria-hidden="true" /> {t('finance.title')}
          </h1>
          <p className="text-muted">{t('finance.subtitle')}</p>
        </div>
        <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="tablist">
          {(['pnl', 'expenses', 'dishes'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-surface shadow' : 'text-muted'}`}>
              {t(`finance.tab.${k}`)}
            </button>
          ))}
        </div>
      </div>
      {tab === 'pnl' && <PnlTab />}
      {tab === 'expenses' && <ExpensesTab />}
      {tab === 'dishes' && <DishesTab />}
    </div>
  );
}

function PnlTab() {
  const { t, i18n } = useTranslation();
  const c = useThemeColors(['success', 'brand', 'danger', 'line', 'muted', 'surface', 'ink', 'sky']);
  const monthStart = today().slice(0, 8) + '01';
  const [range, setRange] = useState({ from: monthStart, to: today() });
  const q = useQuery({ queryKey: ['pnl', range], queryFn: async () => (await api.get<Pnl>('/tenant/finance/pnl', range)).data });
  const r = q.data;
  const fmt = (d: string) => new Intl.DateTimeFormat(intlLocale(i18n.language), { day: 'numeric', month: 'short' }).format(new Date(`${d}T00:00:00`));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" className="field-input !w-auto !py-1.5" aria-label={t('reports.from')} max={range.to} value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
        <span className="text-muted">–</span>
        <input type="date" className="field-input !w-auto !py-1.5" aria-label={t('reports.to')} min={range.from} max={today()} value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
      </div>
      {q.isLoading && <SkeletonRows rows={5} />}
      {q.isError && <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={t('finance.revenue')} value={formatMoney(r.revenue.total)} hint={Number(r.revenue.rooms) > 0 ? t('finance.revenueSplit', { food: formatMoney(r.revenue.restaurant), rooms: formatMoney(r.revenue.rooms) }) : t('finance.withoutGst')} />
            <Kpi label={t('finance.foodCost')} value={formatMoney(r.food_cost)} hint={r.food_cost_percent !== null ? t('finance.ofSales', { value: r.food_cost_percent }) : '—'} />
            <Kpi label={t('finance.expenses')} value={formatMoney(r.expenses.total)} hint={t('finance.expensesHint')} />
            <Kpi label={t('finance.netProfit')} value={formatMoney(r.net_profit)} hint={r.margin_percent !== null ? t('finance.margin', { value: r.margin_percent }) : '—'} tone={Number(r.net_profit) < 0 ? 'danger' : 'success'} />
          </div>
          {(r.coverage.with_recipe < r.coverage.dishes || r.coverage.ingredients_without_cost > 0) && (
            <Alert tone="warn">{t('finance.coverage', { recipes: r.coverage.with_recipe, dishes: r.coverage.dishes, missing: r.coverage.ingredients_without_cost })}</Alert>
          )}
          <section className="card p-5" aria-labelledby="pnl-chart">
            <h2 id="pnl-chart" className="mb-3 text-lg font-bold">
              {t('finance.daily')}
            </h2>
            <div className="h-64" role="img" aria-label={t('finance.daily')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.series.map((d) => ({ label: fmt(d.date), revenue: Number(d.revenue), cost: Number(d.food_cost) + Number(d.expenses), profit: Number(d.profit) }))} margin={{ left: -8, right: 8 }}>
                  <CartesianGrid stroke={c.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: c.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 12, color: c.ink }} />
                  <Bar dataKey="revenue" name={t('finance.revenue')} fill={c.sky} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="cost" name={t('finance.costs')} fill={c.brand} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="profit" name={t('finance.profit')} fill={c.success} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="card p-5" aria-labelledby="pnl-statement">
            <h2 id="pnl-statement" className="mb-3 text-lg font-bold">
              {t('finance.statement')}
            </h2>
            <dl className="divide-y divide-line text-sm">
              {[
                [t('finance.restaurantSales'), r.revenue.restaurant],
                // Part of restaurant sales (not added again).
                ...(r.apps ?? []).map((a) => [t('finance.appSales', { app: a.app === 'swiggy' ? 'Swiggy' : 'Zomato' }), a.sales]),
                ...(Number(r.revenue.rooms) > 0 ? [[t('finance.roomSales'), r.revenue.rooms]] : []),
                ...(Number(r.revenue.tiffin ?? 0) > 0 ? [[t('finance.tiffinSales'), r.revenue.tiffin!]] : []),
                [t('finance.foodCost'), `−${r.food_cost}`],
                [t('finance.grossProfit'), r.gross_profit, true],
                ...r.expenses.by_category.map((e) => [t(`finance.cat.${e.category}`), `−${e.amount}`]),
                [t('finance.netProfit'), r.net_profit, true],
              ].map(([label, value, bold]) => (
                <div key={String(label)} className={`flex justify-between gap-4 py-2 ${bold ? 'font-extrabold' : ''}`}>
                  <dt>{label}</dt>
                  <dd className="tabular-nums">{String(value).startsWith('−') ? `−${formatMoney(String(value).slice(1))}` : formatMoney(String(value))}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted">{t('finance.note')}</p>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'success' | 'danger' }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : ''}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

function ExpensesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ['expenses', month], queryFn: async () => (await api.get<Expense[]>('/tenant/finance/expenses', { month })).data });
  const remove = useMutation<unknown, ApiError, number>({
    mutationFn: (id) => api.delete(`/tenant/finance/expenses/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      void qc.invalidateQueries({ queryKey: ['pnl'] });
    },
  });
  const total = (q.data ?? []).reduce((n, e) => n + Number(e.amount), 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input type="month" className="field-input !w-auto !py-1.5" aria-label={t('gst.month')} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> {t('finance.addExpense')}
        </button>
      </div>
      {q.isLoading && <SkeletonRows rows={4} />}
      {q.data && q.data.length === 0 && <EmptyState title={t("finance.noExpenses")}>{t("finance.noExpensesBody")}</EmptyState>}
      {q.data && q.data.length > 0 && (
        <div className="card divide-y divide-line">
          {q.data.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t(`finance.cat.${e.category}`)}</p>
                <p className="truncate text-xs text-muted">
                  {e.date} · {t(`finance.mode.${e.payment_mode}`)}
                  {e.note ? ` · ${e.note}` : ''}
                </p>
              </div>
              <span className="font-bold tabular-nums">{formatMoney(e.amount)}</span>
              <button type="button" className="btn-ghost !min-h-10 !px-2.5 text-danger" aria-label={t('common.delete')} onClick={() => window.confirm(t('finance.deleteConfirm')) && remove.mutate(e.id)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <div className="flex justify-between px-4 py-3 font-extrabold">
            <span>{t('finance.total')}</span>
            <span className="tabular-nums">{formatMoney(total)}</span>
          </div>
        </div>
      )}
      {adding && <ExpenseDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function ExpenseDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState({ date: today(), category: 'rent', amount: '', payment_mode: 'cash', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => api.post('/tenant/finance/expenses', { ...f, amount: Number(f.amount), note: f.note || null }),
    onSuccess: () => {
      toast.success(t('finance.added'));
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      void qc.invalidateQueries({ queryKey: ['pnl'] });
      onClose();
    },
    onError: (e) => setErrors(e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])) : { amount: e.message }),
  });
  return (
    <Dialog open onClose={onClose} title={t('finance.addExpense')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('finance.date')} error={errors.date}>{(a) => <input {...a} type="date" className="field-input" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}</Field>
          <Field label={t('finance.amount')} error={errors.amount}>{(a) => <input {...a} type="number" min={1} step="0.01" inputMode="decimal" className="field-input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />}</Field>
          <Field label={t('finance.category')} error={errors.category}>
            {(a) => (
              <select {...a} className="field-input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{t(`finance.cat.${c}`)}</option>)}
              </select>
            )}
          </Field>
          <Field label={t('finance.paidBy')} error={errors.payment_mode}>
            {(a) => (
              <select {...a} className="field-input" value={f.payment_mode} onChange={(e) => setF({ ...f, payment_mode: e.target.value })}>
                {MODES.map((m) => <option key={m} value={m}>{t(`finance.mode.${m}`)}</option>)}
              </select>
            )}
          </Field>
        </div>
        <Field label={t('finance.noteLabel')} optional error={errors.note}>{(a) => <input {...a} className="field-input" maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />}</Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>{t('common.back')}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !f.amount}>{save.isPending ? <Spinner /> : t('common.save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

function DishesTab() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['dish-costs'], queryFn: async () => (await api.get<DishCost[]>('/tenant/finance/dish-costs')).data });
  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />;
  const rows = [...(q.data ?? [])].sort((a, b) => (b.food_cost_percent ?? -1) - (a.food_cost_percent ?? -1));
  return (
    <div className="space-y-3">
      <Alert tone="info">{t('finance.dishesIntro')}</Alert>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-2 font-semibold">{t('finance.dish')}</th>
              <th className="px-2 py-2 text-right font-semibold">{t('finance.price')}</th>
              <th className="px-2 py-2 text-right font-semibold">{t('finance.cost')}</th>
              <th className="px-2 py-2 text-right font-semibold">{t('finance.foodCostPct')}</th>
              <th className="px-4 py-2 text-right font-semibold">{t('finance.marginCol')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const high = (d.food_cost_percent ?? 0) > 35;
              return (
                <tr key={`${d.id}-${d.size}`} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="font-semibold">{d.name}</span>
                    {d.size && <span className="text-muted"> · {d.size}</span>}
                    {d.missing_costs > 0 && <span className="block text-xs text-warn">{t('finance.missingCosts', { count: d.missing_costs })}</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatMoney(d.price)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{d.cost === null ? <span className="text-muted">{t('finance.noRecipe')}</span> : formatMoney(d.cost)}</td>
                  <td className={`px-2 py-2.5 text-right font-bold tabular-nums ${high ? 'text-danger' : ''}`}>{d.food_cost_percent === null ? '—' : `${d.food_cost_percent}%`}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{d.margin === null ? '—' : formatMoney(d.margin)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
