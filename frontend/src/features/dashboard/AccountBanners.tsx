import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, LifeBuoy } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { supportTabInfo, useAuthStore } from '@/stores/auth';
import { useCan } from '@/hooks/useSession';
import { Alert } from '@/components/ui';
import type { Session } from '@/types';
import { switchOutlet } from '@/features/account/BranchesPage';

/** "3:33 pm" in IST: a support session lasts an hour, the date is today. */
const timeOf = (iso: string) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

/**
 * A super admin working inside this business (support mode): always visible, with "Back to super
 * admin", which ends the session (audited) and returns to the business in the platform panel.
 * When the hour is up the tab goes back by itself and the panel says the session expired.
 */
export function SupportBar({ session }: { session: Session }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const leaveSupport = useAuthStore((s) => s.leaveSupport);
  const [busy, setBusy] = useState(false);
  const expiresAt = session.support?.expires_at;
  useEffect(() => {
    if (!expiresAt) return undefined;
    const expire = () => {
      leaveSupport('expired');
      qc.clear();
    };
    const ms = Date.parse(expiresAt) - Date.now();
    if (ms <= 0) {
      expire();
      return undefined;
    }
    // Timers can't wait longer than ~24 days; a session lasts an hour.
    const id = window.setTimeout(expire, Math.min(ms + 1000, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [expiresAt, leaveSupport, qc]);
  if (!session.support) return null;
  const back = async () => {
    setBusy(true);
    try {
      await api.post('/support/end');
    } catch {
      /* already ended or expired */
    }
    const info = supportTabInfo();
    leaveSupport('ended');
    qc.clear();
    // Opened as its own browser tab: close it (the panel is still open in the first tab).
    if (info?.newTab) window.close();
    navigate(info?.tenantId ? `/platform/tenants/${info.tenantId}` : '/platform', { replace: true });
  };
  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#7c2d12] px-4 py-2 text-center text-sm font-semibold text-white" role="status">
      <LifeBuoy className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{t('support.mode', { name: session.tenant?.name })}</span>
      <span className="rounded bg-white/15 px-2 py-0.5 text-xs">{session.support.read_only ? t('support.readOnly') : t('support.canChange')}</span>
      <span className="font-normal">{t('support.ends', { time: timeOf(session.support.expires_at) })}</span>
      <span className="hidden font-normal opacity-90 sm:inline">“{session.support.reason}”</span>
      <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded bg-white px-3 py-1 text-xs font-bold text-[#7c2d12]" onClick={() => void back()} disabled={busy}>
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {t('support.back')}
      </button>
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
