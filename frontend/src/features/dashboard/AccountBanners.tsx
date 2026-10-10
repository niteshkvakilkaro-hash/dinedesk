import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LifeBuoy } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { endSupportTab } from '@/stores/auth';
import { useCan } from '@/hooks/useSession';
import { Alert } from '@/components/ui';
import type { Session } from '@/types';
import { switchOutlet } from '@/features/account/BranchesPage';

/** A super admin working inside this business: always visible, with "End session". */
export function SupportBar({ session }: { session: Session }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  if (!session.support) return null;
  const end = async () => {
    setBusy(true);
    try {
      await api.post('/support/end');
    } catch {
      /* already ended or expired */
    }
    endSupportTab();
    window.close();
    window.location.assign('/platform');
  };
  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#7c2d12] px-4 py-2 text-center text-sm font-semibold text-white" role="status">
      <LifeBuoy className="h-4 w-4" aria-hidden="true" />
      <span>{t('support.bar', { name: session.tenant?.name, time: formatDateTime(session.support.expires_at) })}</span>
      <span className="rounded bg-white/15 px-2 py-0.5 text-xs">{session.support.read_only ? t('support.readOnly') : t('support.canChange')}</span>
      <span className="font-normal opacity-90">“{session.support.reason}”</span>
      <button type="button" className="rounded bg-white px-3 py-1 text-xs font-bold text-[#7c2d12]" onClick={() => void end()} disabled={busy}>{t('support.end')}</button>
    </div>
  );
}

/** Trial ending, payment due, read-only: what to do, with a link to Billing for the owner. */
export function BillingBanner({ session }: { session: Session }) {
  const { t } = useTranslation();
  const canBilling = useCan('billing.manage');
  const tenant = session.tenant;
  const s = tenant?.subscription;
  if (!tenant || tenant.is_demo || session.support) return null;
  const link = canBilling && !tenant.is_branch ? <Link to="/dashboard/billing" className="ml-1 font-bold underline">{t('billingBanner.open')}</Link> : null;
  if (tenant.status === 'read_only') {
    return <div className="mb-5"><Alert tone="warn">{t('dashboard.readOnly')}{link}</Alert></div>;
  }
  if (!s) return null;
  const days = s.trial_ends_at ? Math.ceil((Date.parse(s.trial_ends_at) - Date.now()) / 86400000) : null;
  if (s.grace_ends_at && s.status !== 'active' && Date.parse(s.grace_ends_at) > Date.now()) {
    return <div className="mb-5"><Alert tone="warn">{t(s.status === 'trialing' || s.status === 'past_due' && days !== null && days <= 0 ? 'billingBanner.trialOver' : 'billingBanner.paymentDue', { date: formatDate(s.grace_ends_at) })}{link}</Alert></div>;
  }
  if (s.status === 'trialing' && days !== null && days <= 7 && days > 0 && canBilling) {
    return <div className="mb-5"><Alert tone="info">{t('billingBanner.trialEnds', { count: days })}{link}</Alert></div>;
  }
  return null;
}

/** Owners of several outlets switch between them here. */
export function OutletSwitcher({ session }: { session: Session }) {
  const { t } = useTranslation();
  if (session.branches.length < 2) return null;
  const current = session.branches.find((b) => b.current);
  return (
    <label className="hidden items-center gap-1 text-sm sm:flex">
      <span className="sr-only">{t('branches.switch')}</span>
      <select className="field-input !min-h-9 !w-auto !py-1 text-sm" value={current?.id} onChange={(e) => void switchOutlet(e.target.value)}>
        {session.branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.city ? ` · ${b.city}` : ''}</option>)}
      </select>
    </label>
  );
}
