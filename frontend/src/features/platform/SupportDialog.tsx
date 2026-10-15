import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ExternalLink, LifeBuoy } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { isDineDeskApp } from '@/lib/dinedeskApp';
import { supportLink, useAuthStore } from '@/stores/auth';
import { Alert, Dialog, Field, Spinner, Toggle } from '@/components/ui';

/** The server asks for at least this many characters (SupportController). */
export const SUPPORT_REASON_MIN = 10;

interface Started { token: string; expires_at: string; business: string }

/**
 * "Open dashboard" for a business: reason (required, audited), view only unless "Can make changes".
 * Opens in this tab (works in the Android app too); on a computer it can open in a new tab instead.
 */
export function SupportDialog({ tenant, open, onClose }: { tenant: { id: string; name: string }; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const startSupport = useAuthStore((s) => s.startSupport);
  const [reason, setReason] = useState('');
  const [canChange, setCanChange] = useState(false);
  const [error, setError] = useState('');
  const inApp = isDineDeskApp();

  const start = useMutation<Started, ApiError, { newTab: boolean }>({
    mutationFn: async () => (await api.post<Started>(`/platform/tenants/${tenant.id}/support`, { reason: reason.trim(), read_only: !canChange })).data,
    onSuccess: (d, { newTab }) => {
      setReason('');
      setError('');
      void qc.invalidateQueries({ queryKey: ['platform', 'support', tenant.id] });
      if (newTab) {
        // A separate tab keeps its own token; this tab stays in the platform panel.
        window.open(supportLink(d.token, { tenantId: tenant.id, name: d.business }), '_blank', 'noopener');
        onClose();
        return;
      }
      // This tab: the support token is kept in sessionStorage, the own sign-in stays as it is.
      startSupport(d.token, { tenantId: tenant.id, name: d.business });
      qc.clear();
      navigate('/dashboard');
    },
    onError: (e) => setError(e.errors ? Object.values(e.errors)[0][0] : e.message),
  });
  const ready = reason.trim().length >= SUPPORT_REASON_MIN && !start.isPending;

  return (
    <Dialog open={open} onClose={onClose} title={t('platform.support.dialogTitle', { name: tenant.name })}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready) start.mutate({ newTab: false }); }} noValidate>
        <p className="text-sm text-muted">{t('platform.support.dialogText')}</p>
        {error && <Alert>{error}</Alert>}
        <Field label={t('platform.support.reason')} hint={t('platform.support.reasonHint')}>
          {(a) => <input {...a} data-autofocus className="field-input" maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        <Toggle checked={canChange} onChange={setCanChange} label={t('support.canChange')} hint={canChange ? t('platform.support.changesHint') : t('platform.support.viewOnlyHint')} />
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button type="submit" className="btn-primary sm:flex-1" disabled={!ready}>
            {start.isPending && !start.variables?.newTab ? <Spinner /> : <><LifeBuoy className="h-4 w-4" aria-hidden="true" /> {t('platform.support.start')}</>}
          </button>
          {/* New tabs don't open inside the Android app. */}
          {!inApp && (
            <button type="button" className="btn-outline" disabled={!ready} onClick={() => start.mutate({ newTab: true })}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> {t('platform.support.newTab')}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

/** The "Open dashboard" button with its dialog. */
export function OpenDashboardButton({ tenant, className = 'btn-outline !min-h-9 !px-3 text-sm', disabled }: { tenant: { id: string; name: string }; className?: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} disabled={disabled} title={disabled ? t('platform.support.suspended') : undefined}>
        <LifeBuoy className="h-4 w-4" aria-hidden="true" /> {t('platform.support.openDashboard')}
      </button>
      <SupportDialog tenant={tenant} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
