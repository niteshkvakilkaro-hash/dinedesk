import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Copy, Gift, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { whatsappShare } from '@/lib/referral';
import { useSession } from '@/hooks/useSession';
import { Alert, Badge, SkeletonRows, toast } from '@/components/ui';

export interface ReferralInfo {
  available: boolean;
  code: string | null;
  reward_days: number;
  stats: { signed_up: number; paying: number; days_earned: number; days_pending: number };
  businesses: { name: string; status: 'signed_up' | 'paying'; joined_at: string | null }[];
  rewards: { role: 'referrer' | 'referred'; days: number; status: 'pending' | 'applied'; applied_to: 'trial' | 'period' | 'manual' | null; applied_at: string | null; new_end: string | null; business: string | null }[];
  referred_by: string | null;
}

/** The link people open: DineDesk's home page (signup is one tap away), with the code. */
export const referralLink = (code: string) => `${window.location.origin}/?ref=${code}`;

/** Dashboard → Billing (owner): share a link; both businesses get free days on the new one's first payment. */
export function ReferralCard() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const q = useQuery({ queryKey: ['referrals'], queryFn: async () => (await api.get<ReferralInfo>('/tenant/referrals')).data });

  if (q.isLoading) return <section className="card p-5"><SkeletonRows rows={3} /></section>;
  if (!q.data) return null;
  const r = q.data;
  const link = r.code ? referralLink(r.code) : '';
  const shareText = t('referrals.shareText', { business: session?.tenant?.name ?? '', days: r.reward_days, link });
  const copy = () => void navigator.clipboard?.writeText(link).then(() => toast.success(t('referrals.copied')), () => toast.error(t('referrals.copyFailed')));

  const rewardLine = (w: ReferralInfo['rewards'][number]) => {
    if (w.status === 'pending') return t('referrals.rewardPending');
    if (w.applied_to === 'trial') return t('referrals.appliedTrial', { date: formatDate(w.new_end ?? '') });
    if (w.applied_to === 'period') return t('referrals.appliedPeriod', { date: formatDate(w.new_end ?? '') });
    return t('referrals.appliedManual', { date: formatDate(w.applied_at ?? '') });
  };

  return (
    <section className="card space-y-4 p-5" aria-labelledby="ref-h">
      <div>
        <h2 id="ref-h" className="flex items-center gap-2 text-lg font-bold"><Gift className="h-5 w-5 text-brand" aria-hidden="true" /> {t('referrals.title')}</h2>
        <p className="mt-1 text-sm text-muted">{t('referrals.intro', { days: r.reward_days })}</p>
      </div>

      {!r.available ? (
        <Alert tone="info">{t('referrals.demo')}</Alert>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="ref-link" className="sr-only">{t('referrals.linkLabel')}</label>
            <input id="ref-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="field-input min-w-0 flex-1 font-mono text-sm" />
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex">
              <button type="button" className="btn-outline !min-h-11 text-sm" onClick={copy}><Copy className="h-4 w-4" aria-hidden="true" /> {t('referrals.copy')}</button>
              <a className="btn-primary !min-h-11 text-sm" href={whatsappShare(shareText)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" aria-hidden="true" /> {t('referrals.whatsapp')}<span className="sr-only"> ({t('common.opensInNewTab')})</span>
              </a>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-2 text-center">
            {([
              ['signedUp', r.stats.signed_up],
              ['paying', r.stats.paying],
              ['daysEarned', r.stats.days_earned],
            ] as const).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-ink/5 px-2 py-3">
                <dt className="text-xs text-muted">{t(`referrals.stats.${key}`)}</dt>
                <dd className="text-2xl font-extrabold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {r.businesses.length > 0 ? (
            <div>
              <h3 className="text-sm font-bold">{t('referrals.businesses')}</h3>
              <ul className="mt-1 divide-y divide-line text-sm">
                {r.businesses.map((b, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate">{b.name}</span>
                    <Badge tone={b.status === 'paying' ? 'paid' : 'neutral'}>{t(`referrals.status.${b.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted">{t('referrals.none')}</p>
          )}
        </>
      )}

      {r.rewards.length > 0 && (
        <div>
          <h3 className="text-sm font-bold">{t('referrals.rewards')}</h3>
          <ul className="mt-1 divide-y divide-line text-sm">
            {r.rewards.map((w, i) => (
              <li key={i} className="py-2">
                <span className="font-semibold">{t(`referrals.rewardFor.${w.role}`, { days: w.days, business: w.business ?? '' })}</span>
                <span className={`block ${w.status === 'pending' ? 'text-warn' : 'text-muted'}`}>{rewardLine(w)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.referred_by && <p className="text-xs text-muted">{t('referrals.referredBy', { name: r.referred_by })}</p>}
    </section>
  );
}
