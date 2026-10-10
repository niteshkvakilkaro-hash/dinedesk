import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, Copy, Network, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useCan } from '@/hooks/useSession';
import { Alert, Badge, Dialog, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';

interface Outlet { id: string; name: string; city: string | null; status: string; is_main: boolean; current: boolean; site_host: string; staff: number }
interface BranchData { outlets: Outlet[]; enabled: boolean; limit: number | null; can_add: boolean }
interface Report { from: string; to: string; outlets: { id: string; name: string; city: string | null; is_main: boolean; totals: { orders: number; sales: string; average: string } }[]; total: { orders: number; sales: string; gst: string; average: string } }

/** Switching reloads the dashboard into the other outlet. */
export async function switchOutlet(id: string) {
  await api.post(`/tenant/branches/${id}/switch`);
  window.location.assign('/dashboard');
}

function AddBranch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', city: '', copy_menu: true, copy_theme: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation<{ id: string; name: string }, ApiError>({
    mutationFn: async () => (await api.post<{ id: string; name: string }>('/tenant/branches', f)).data,
    onSuccess: (b) => { void qc.invalidateQueries({ queryKey: ['branches'] }); void qc.invalidateQueries({ queryKey: ['session'] }); toast.success(t('branches.added', { name: b.name })); onClose(); },
    onError: (e) => setErrors(e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])) : { form: e.message }),
  });
  return (
    <Dialog open={open} onClose={onClose} title={t('branches.add')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        {errors.form && <Alert>{errors.form}</Alert>}
        <Field label={t('branches.name')} hint={t('branches.nameHint')} error={errors.name}>{(a) => <input {...a} className="field-input" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Field label={t('branches.city')} error={errors.city}>{(a) => <input {...a} className="field-input" maxLength={80} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />}</Field>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.copy_menu} onChange={(e) => setF({ ...f, copy_menu: e.target.checked })} /> {t('branches.copyMenu')}</label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.copy_theme} onChange={(e) => setF({ ...f, copy_theme: e.target.checked })} /> {t('branches.copyTheme')}</label>
        <p className="text-xs text-muted">{t('branches.addHint')}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('branches.add')}</button>
        </div>
      </form>
    </Dialog>
  );
}

export default function BranchesPage() {
  const { t } = useTranslation();
  const canReports = useCan('reports.view');
  const q = useQuery({ queryKey: ['branches'], queryFn: async () => (await api.get<BranchData>('/tenant/branches')).data });
  const report = useQuery({ queryKey: ['branches', 'report'], queryFn: async () => (await api.get<Report>('/tenant/branches/report')).data, enabled: canReports && (q.data?.outlets.length ?? 0) > 1 });
  const [adding, setAdding] = useState(false);
  const copy = useMutation<{ dishes: number }, ApiError, Outlet>({
    mutationFn: async (o) => (await api.post<{ dishes: number }>(`/tenant/branches/${o.id}/copy-menu`)).data,
    onSuccess: (r, o) => toast.success(t('branches.copied', { count: r.dishes, name: o.name })),
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <SkeletonRows rows={5} />;
  if (q.isError || !q.data) return <ErrorState message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight"><Network className="h-7 w-7" aria-hidden="true" /> {t('branches.title')}</h1>
          <p className="text-muted">{t('branches.subtitle')}</p>
        </div>
        {d.can_add && <button type="button" className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden="true" /> {t('branches.add')}</button>}
      </div>
      {!d.enabled && <Alert tone="info">{t('branches.proOnly')}</Alert>}
      <ul className="grid gap-3 md:grid-cols-2">
        {d.outlets.map((o) => (
          <li key={o.id} className={`card space-y-2 p-5 ${o.current ? 'ring-2 ring-brand' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold">{o.name}</h2>
              {o.is_main && <Badge tone="confirmed">{t('branches.main')}</Badge>}
              {o.current && <Badge tone="paid">{t('branches.here')}</Badge>}
              {o.status !== 'live' && <Badge tone="pending">{t(`branches.status.${o.status}`)}</Badge>}
            </div>
            <p className="text-sm text-muted">{[o.city, o.site_host, t('branches.staff', { count: o.staff })].filter(Boolean).join(' · ')}</p>
            <div className="flex flex-wrap gap-2">
              {!o.current && <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => void switchOutlet(o.id).catch((e: Error) => toast.error(e.message))}><ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> {t('branches.switch')}</button>}
              {!o.current && <button type="button" className="btn-ghost !min-h-10 text-sm" onClick={() => window.confirm(t('branches.copyConfirm', { name: o.name })) && copy.mutate(o)}><Copy className="h-4 w-4" aria-hidden="true" /> {t('branches.copyHere')}</button>}
            </div>
          </li>
        ))}
      </ul>
      {report.data && (
        <section className="card space-y-3 p-5" aria-labelledby="br-rep">
          <h2 id="br-rep" className="text-lg font-bold">{t('branches.report')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1.5 font-semibold">{t('branches.outlet')}</th><th className="text-right font-semibold">{t('reports.orders')}</th><th className="text-right font-semibold">{t('reports.sales')}</th><th className="text-right font-semibold">{t('reports.aov')}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {report.data.outlets.map((o) => <tr key={o.id}><td className="py-1.5">{o.name}</td><td className="text-right tabular-nums">{o.totals.orders}</td><td className="text-right tabular-nums">{formatMoney(o.totals.sales)}</td><td className="text-right tabular-nums">{formatMoney(o.totals.average)}</td></tr>)}
                <tr className="font-bold"><td className="py-1.5">{t('branches.total')}</td><td className="text-right tabular-nums">{report.data.total.orders}</td><td className="text-right tabular-nums">{formatMoney(report.data.total.sales)}</td><td className="text-right tabular-nums">{formatMoney(report.data.total.average)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">{t('branches.reportHint', { from: report.data.from, to: report.data.to })}</p>
        </section>
      )}
      <AddBranch open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
