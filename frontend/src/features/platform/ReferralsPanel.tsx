import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Badge, Spinner, toast } from '@/components/ui';
import type { PlatformReferrals, PlatformTenantDetail } from '@/types';

type Reward = PlatformReferrals['rewards'][number];

/** A pending credit given another way (refund, Razorpay offer ...): mark it applied, with a note for the audit log. */
function MarkApplied({ tenantId, reward }: { tenantId: string; reward: Reward }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const m = useMutation<{ data: PlatformReferrals }, ApiError>({
    mutationFn: () => api.post<PlatformReferrals>(`/platform/tenants/${tenantId}/referral-rewards/${reward.id}/applied`, { note }),
    onSuccess: (res) => {
      qc.setQueryData<PlatformTenantDetail>(['platform', 'tenant', tenantId], (old) => (old ? { ...old, referrals: res.data } : old));
      toast.success(t('common.saved'));
    },
    onError: (e) => toast.error(e.message),
  });
  if (!open) return <button type="button" className="btn-ghost !min-h-9 border border-line text-sm" onClick={() => setOpen(true)}>{t('platform.referrals.markApplied')}</button>;
  return (
    <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <input className="field-input !w-auto min-w-0 flex-1 !py-1.5 text-sm" placeholder={t('platform.referrals.note')} aria-label={t('platform.referrals.note')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
      <button type="submit" className="btn-primary !min-h-9 !px-4 text-sm" disabled={note.trim().length < 5 || m.isPending}>{m.isPending ? <Spinner className="h-4 w-4" /> : t('common.save')}</button>
    </form>
  );
}

export function ReferralsPanel({ tenantId, r }: { tenantId: string; r: PlatformReferrals }) {
  const { t } = useTranslation();
  const status = (w: Reward) =>
    w.status === 'pending'
      ? t('platform.referrals.pending')
      : w.applied_to === 'manual'
        ? t('platform.referrals.appliedManual', { date: formatDate(w.applied_at ?? '') })
        : t(`platform.referrals.applied_${w.applied_to ?? 'trial'}`, { date: formatDate(w.new_end ?? '') });

  return (
    <section className="card space-y-4 p-5 text-sm" aria-labelledby="referrals-title">
      <h2 id="referrals-title" className="text-lg font-bold">{t('platform.referrals.title')}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <p><span className="text-muted">{t('platform.referrals.code')}:</span> <span className="font-mono font-bold">{r.code ?? '—'}</span></p>
        <p>
          <span className="text-muted">{t('platform.referrals.referredBy')}:</span>{' '}
          {r.referred_by ? <Link className="font-semibold underline" to={`/platform/tenants/${r.referred_by.id}`}>{r.referred_by.name}</Link> : '—'}
          {r.rewarded_at && <span className="text-muted"> · {t('platform.referrals.firstPayment', { date: formatDate(r.rewarded_at) })}</span>}
        </p>
      </div>

      <div>
        <h3 className="font-bold">{t('platform.referrals.referred', { n: r.referred.length })}</h3>
        {r.referred.length ? (
          <ul className="mt-1 divide-y divide-line">
            {r.referred.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link className="font-semibold underline" to={`/platform/tenants/${b.id}`}>{b.name}</Link>
                <span className="flex items-center gap-2">
                  {b.created_at && <span className="text-muted">{formatDate(b.created_at)}</span>}
                  <Badge tone={b.paying ? 'paid' : 'neutral'}>{b.paying ? t('referrals.status.paying') : t('referrals.status.signed_up')}</Badge>
                  {b.deleted ? <Badge tone="cancelled">{t('platform.referrals.deleted')}</Badge> : <Badge tone={b.status}>{t(`statuses.${b.status}`)}</Badge>}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-muted">{t('platform.referrals.none')}</p>}
      </div>

      <div>
        <h3 className="font-bold">{t('platform.referrals.rewards')}</h3>
        {r.rewards.length ? (
          <ul className="mt-1 divide-y divide-line">
            {r.rewards.map((w) => (
              <li key={w.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-semibold">{t(`referrals.rewardFor.${w.role}`, { days: w.days, business: w.business ?? '' })}</span>
                    <span className={`block ${w.status === 'pending' ? 'text-warn' : 'text-muted'}`}>{status(w)}{w.note ? ` — ${w.note}` : ''}</span>
                  </span>
                  {w.status === 'pending' && <MarkApplied tenantId={tenantId} reward={w} />}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-muted">{t('platform.referrals.noRewards')}</p>}
      </div>
    </section>
  );
}
