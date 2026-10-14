import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, CreditCard, Download, FileArchive, Loader2 } from 'lucide-react';
import { api, ApiError, downloadFile } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { loadRazorpay } from '@/site/ordering';
import { Alert, Badge, EmptyState, ErrorState, SkeletonRows, Spinner, toast } from '@/components/ui';
import { ReferralCard } from './ReferralCard';
import { scrollToSection, useOpenParam } from '@/lib/urlParams';

type Cycle = 'monthly' | 'yearly';

interface PlanRow {
  code: string;
  name: string;
  description: string | null;
  price_monthly: string | null;
  price_yearly: string | null;
  charge_monthly: string | null;
  charge_yearly: string | null;
  features: string[];
  limits: Record<string, number | null>;
}

interface SubscriptionInfo {
  status: 'trialing' | 'pending' | 'active' | 'past_due' | 'halted' | 'cancelled' | 'expired';
  plan: { code: string; name: string };
  billing_cycle: Cycle;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  grace_ends_at: string | null;
  cancel_at_period_end: boolean;
  scheduled_plan: { code: string; name: string } | null;
  paid: boolean;
}

interface Billing {
  business_status: string;
  is_branch: boolean;
  main_business: string | null;
  subscription: SubscriptionInfo | null;
  payments_ready: boolean;
  gst_rate: number;
  grace_days: number;
  plans: PlanRow[];
  catalogue: string[];
  usage: Record<string, number>;
  limits: Record<string, number | null>;
  invoices: { id: string; number: string; plan: string; billing_cycle: Cycle; period_start: string | null; period_end: string | null; total: string; issued_at: string }[];
}

interface ExportRow { id: string; status: 'queued' | 'ready' | 'failed' | 'expired'; size: number | null; created_at: string; expires_at: string | null }

/** Shown on plan cards: the things owners compare. */
const HIGHLIGHTS = ['online_ordering', 'reservations', 'qr_ordering', 'pos', 'kds', 'inventory', 'loyalty', 'coupons', 'custom_domain', 'hotel', 'multi_branch'];

function useBilling() {
  return useQuery({ queryKey: ['billing'], queryFn: async () => (await api.get<Billing>('/tenant/subscription')).data });
}

function StatusCard({ b }: { b: Billing }) {
  const { t } = useTranslation();
  const s = b.subscription;
  if (!s) return null;
  const tone = s.status === 'active' ? 'paid' : s.status === 'trialing' ? 'confirmed' : 'pending';
  return (
    <section className="card space-y-2 p-5" aria-labelledby="sub-h">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="sub-h" className="text-lg font-bold">{t('billing.current', { plan: s.plan.name })}</h2>
        <Badge tone={tone}>{t(`billing.status.${s.status}`)}</Badge>
        {s.paid && <span className="text-sm text-muted">{t(`billing.cycle.${s.billing_cycle}`)}</span>}
      </div>
      {s.status === 'trialing' && s.trial_ends_at && <p>{t('billing.trialEnds', { date: formatDate(s.trial_ends_at) })}</p>}
      {s.status === 'active' && s.current_period_ends_at && <p>{s.cancel_at_period_end ? t('billing.endsOn', { date: formatDate(s.current_period_ends_at) }) : t('billing.renewsOn', { date: formatDate(s.current_period_ends_at) })}</p>}
      {s.scheduled_plan && <p>{t('billing.scheduled', { plan: s.scheduled_plan.name, date: s.current_period_ends_at ? formatDate(s.current_period_ends_at) : '' })}</p>}
      {s.grace_ends_at && s.status !== 'active' && <Alert tone="warn">{t('billing.graceUntil', { date: formatDate(s.grace_ends_at) })}</Alert>}
      {b.business_status === 'read_only' && <Alert tone="warn">{t('billing.readOnlyNow')}</Alert>}
    </section>
  );
}

function DataExport() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['exports'],
    queryFn: async () => (await api.get<ExportRow[]>('/tenant/exports')).data,
    refetchInterval: (q) => (q.state.data?.some((e) => e.status === 'queued') ? 4000 : false),
  });
  const start = useMutation<unknown, ApiError>({
    mutationFn: () => api.post('/tenant/exports'),
    onSuccess: () => { toast.success(t('billing.export.started')); void qc.invalidateQueries({ queryKey: ['exports'] }); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <section className="card space-y-3 p-5" aria-labelledby="exp-h">
      <h2 id="exp-h" className="flex items-center gap-2 text-lg font-bold"><FileArchive className="h-5 w-5" aria-hidden="true" /> {t('billing.export.title')}</h2>
      <p className="text-sm text-muted">{t('billing.export.text')}</p>
      <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => start.mutate()} disabled={start.isPending}>{start.isPending ? <Spinner /> : t('billing.export.button')}</button>
      {!!list.data?.length && (
        <ul className="divide-y divide-line text-sm">
          {list.data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{formatDate(e.created_at)} · {t(`billing.export.status.${e.status}`)}{e.size ? ` · ${(e.size / 1024 / 1024).toFixed(1)} MB` : ''}</span>
              {e.status === 'queued' && <Loader2 className="h-4 w-4 animate-spin" aria-label={t('common.loading')} />}
              {e.status === 'ready' && <button type="button" className="btn-ghost !min-h-9 text-sm" onClick={() => void downloadFile(`/tenant/exports/${e.id}`, `export-${e.created_at.slice(0, 10)}.zip`).catch((err: Error) => toast.error(err.message))}><Download className="h-4 w-4" aria-hidden="true" /> {t('billing.export.download')}</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function BillingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useBilling();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // From the dashboard search: ?open=refer or ?open=export scrolls to that card.
  useOpenParam(scrollToSection, !!q.data);

  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['billing'] }), qc.invalidateQueries({ queryKey: ['session'] })]);
  };

  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.isError || !q.data) return <ErrorState message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const b = q.data;
  const s = b.subscription;
  const activePaid = s?.status === 'active' && s.paid;
  const shownCycle: Cycle = cycle ?? (s?.paid ? s.billing_cycle : 'monthly');

  const choose = async (plan: PlanRow) => {
    setBusy(plan.code);
    try {
      if (activePaid) {
        const r = await api.post<SubscriptionInfo>('/tenant/subscription/change', { plan: plan.code, cycle: shownCycle });
        toast.success(r.message ?? t('common.saved'));
      } else {
        const r = await api.post<{ key_id: string; subscription_id: string; name: string; description: string; prefill: Record<string, string | null> }>('/tenant/subscription/checkout', { plan: plan.code, cycle: shownCycle });
        await loadRazorpay();
        const paid = await new Promise<boolean>((resolve) => {
          const rzp = new window.Razorpay!({
            key: r.data.key_id,
            subscription_id: r.data.subscription_id,
            name: r.data.name,
            description: r.data.description,
            prefill: r.data.prefill,
            handler: async (res: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
              try {
                await api.post('/tenant/subscription/verify', res);
              } catch {
                /* the webhook still confirms it */
              }
              resolve(true);
            },
            modal: { ondismiss: () => resolve(false) },
          });
          rzp.open();
        });
        if (paid) toast.success(t('billing.thanks'));
      }
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!window.confirm(t('billing.cancelConfirm'))) return;
    try {
      await api.post('/tenant/subscription/cancel');
      toast.success(t('billing.cancelled'));
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const overLimit = (p: PlanRow) => Object.entries(p.limits).filter(([k, max]) => max !== null && (b.usage[k] ?? 0) > max).map(([k]) => k);
  const save = (p: PlanRow) => (p.price_monthly && p.price_yearly ? Math.round(Number(p.price_monthly) * 12 - Number(p.price_yearly)) : 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight"><CreditCard className="h-7 w-7" aria-hidden="true" /> {t('billing.title')}</h1>
        <p className="text-muted">{t('billing.subtitle')}</p>
      </div>
      {b.is_branch ? <Alert tone="info">{t('billing.branch', { name: b.main_business })}</Alert> : <StatusCard b={b} />}

      {!b.is_branch && (
        <section aria-labelledby="plans-h" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="plans-h" className="text-xl font-bold">{t('billing.plans')}</h2>
            <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="radiogroup" aria-label={t('billing.cycleLabel')}>
              {(['monthly', 'yearly'] as Cycle[]).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={shownCycle === c} onClick={() => setCycle(c)} className={`rounded-full px-4 py-2 text-sm font-semibold ${shownCycle === c ? 'bg-surface shadow' : 'text-muted'}`}>{t(`billing.cycle.${c}`)}</button>
              ))}
            </div>
          </div>
          {!b.payments_ready && <Alert tone="info">{t('billing.notReady')}</Alert>}
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {b.plans.map((p) => {
              const price = shownCycle === 'yearly' ? p.price_yearly : p.price_monthly;
              const charge = shownCycle === 'yearly' ? p.charge_yearly : p.charge_monthly;
              const isCurrent = s?.plan.code === p.code && (!s.paid || s.billing_cycle === shownCycle) && s.status !== 'expired';
              const over = overLimit(p);
              return (
                <li key={p.code} className={`card flex flex-col gap-3 p-5 ${isCurrent ? 'ring-2 ring-brand' : ''}`}>
                  <div className="flex items-center justify-between gap-2"><h3 className="text-lg font-bold">{p.name}</h3>{isCurrent && <Badge tone="confirmed">{t('billing.yourPlan')}</Badge>}</div>
                  {p.description && <p className="text-sm text-muted">{p.description}</p>}
                  {price ? (
                    <p>
                      <span className="text-3xl font-extrabold">{formatMoney(price)}</span>
                      <span className="text-muted"> / {t(`billing.per.${shownCycle}`)}</span>
                      <span className="block text-xs text-muted">{b.gst_rate ? t('billing.plusGst', { rate: b.gst_rate, total: formatMoney(charge) }) : t('billing.noGst')}</span>
                      {shownCycle === 'yearly' && save(p) > 0 && <span className="block text-xs font-semibold text-success">{t('billing.save', { amount: formatMoney(save(p)) })}</span>}
                    </p>
                  ) : <p className="text-sm font-semibold text-muted">{t('billing.unpriced')}</p>}
                  <ul className="space-y-1 text-sm">
                    {HIGHLIGHTS.filter((f) => p.features.includes(f)).map((f) => <li key={f} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-success" aria-hidden="true" />{t(`billing.feature.${f}`)}</li>)}
                    {(['menu_items', 'staff_accounts', 'branches'] as const).map((k) => <li key={k} className="text-muted">{t(`billing.limit.${k}`, { count: p.limits[k] ?? 0, context: p.limits[k] === null ? 'unlimited' : undefined })}</li>)}
                  </ul>
                  {!!over.length && !isCurrent && <p className="text-xs font-semibold text-warn">{t('billing.overLimit', { what: over.map((k) => t(`billing.limitName.${k}`)).join(', ') })}</p>}
                  <div className="mt-auto pt-2">
                    {isCurrent && activePaid ? (
                      !s.cancel_at_period_end && <button type="button" className="btn-ghost !min-h-10 w-full text-sm text-danger" onClick={() => void cancel()}>{t('billing.cancel')}</button>
                    ) : (
                      <button type="button" className="btn-primary w-full" disabled={!price || !b.payments_ready || !!busy} onClick={() => void choose(p)}>
                        {busy === p.code ? <Spinner /> : activePaid ? t('billing.switchTo', { plan: p.name }) : t('billing.subscribe', { plan: p.name })}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">{t('billing.terms', { days: b.grace_days })}</p>
        </section>
      )}

      {!b.is_branch && (
        <section className="card space-y-3 p-5" aria-labelledby="inv-h">
          <h2 id="inv-h" className="text-lg font-bold">{t('billing.invoices')}</h2>
          {b.invoices.length ? (
            <ul className="divide-y divide-line text-sm">
              {b.invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><b>{i.number}</b> · {formatDate(i.issued_at)} · {i.plan} ({t(`billing.cycle.${i.billing_cycle}`)})</span>
                  <span className="flex items-center gap-3"><span className="font-semibold">{formatMoney(i.total)}</span>
                    <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={() => void downloadFile(`/tenant/subscription/invoices/${i.id}`, `${i.number.replace(/\//g, '-')}.pdf`).catch((e: Error) => toast.error(e.message))} aria-label={t('billing.downloadInvoice', { number: i.number })}><Download className="h-4 w-4" aria-hidden="true" /></button>
                  </span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title={t('billing.noInvoices')} />}
        </section>
      )}

      {/* Branches are referred through their main business. */}
      {!b.is_branch && <div id="find-refer" className="rounded-card"><ReferralCard /></div>}

      <div id="find-export" className="rounded-card"><DataExport /></div>
    </div>
  );
}
