import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download, LifeBuoy } from 'lucide-react';
import { api, ApiError, downloadFile } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { toast } from '@/components/ui';
import { OpenDashboardButton } from './SupportDialog';

interface SessionRow { admin: string | null; reason: string; read_only: boolean; started_at: string; ended_at: string | null; expires_at: string; open: boolean; changes: number }

/** Super admin: support sessions for a business (start one, past ones) and its data export. */
export function SupportPanel({ tenantId, name, suspended }: { tenantId: string; name: string; suspended: boolean }) {
  const { t } = useTranslation();
  const sessions = useQuery({ queryKey: ['platform', 'support', tenantId], queryFn: async () => (await api.get<SessionRow[]>(`/platform/tenants/${tenantId}/support`)).data });
  const [exportReason, setExportReason] = useState('');
  const [exportId, setExportId] = useState<string | null>(null);
  const exp = useMutation<{ id: string; status: string }, ApiError>({
    mutationFn: async () => (await api.post<{ id: string; status: string }>(`/platform/tenants/${tenantId}/export`, { reason: exportReason })).data,
    onSuccess: (d) => { setExportId(d.id); setExportReason(''); toast.success(t('platform.support.exportStarted')); },
    onError: (e) => toast.error(e.errors ? Object.values(e.errors)[0][0] : e.message),
  });

  return (
    <section className="card space-y-4 p-5" aria-labelledby="support-title">
      <h2 id="support-title" className="flex items-center gap-2 text-lg font-bold"><LifeBuoy className="h-5 w-5" aria-hidden="true" /> {t('platform.support.title')}</h2>
      <p className="text-sm text-muted">{t('platform.support.panelText', { name })}</p>
      <OpenDashboardButton tenant={{ id: tenantId, name }} disabled={suspended} />
      {!!sessions.data?.length && (
        <ul className="space-y-1 text-sm">
          {sessions.data.map((s, i) => (
            <li key={i} className="text-muted">
              <span className="font-mono text-xs">{formatDateTime(s.started_at)}</span> · {s.admin} · “{s.reason}” · {s.read_only ? t('platform.support.viewOnly') : t('platform.support.changes', { count: s.changes })} · {s.open ? t('platform.support.open_') : s.ended_at ? t('platform.support.ended') : t('platform.support.expired')}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="font-bold">{t('platform.support.exportTitle')}</h3>
        <div className="flex flex-wrap gap-2">
          <input className="field-input flex-1" aria-label={t('platform.support.exportReason')} placeholder={t('platform.support.exportReason')} maxLength={255} value={exportReason} onChange={(e) => setExportReason(e.target.value)} />
          <button type="button" className="btn-outline" disabled={exportReason.trim().length < 5 || exp.isPending} onClick={() => exp.mutate()}>{t('platform.support.export')}</button>
          {exportId && <button type="button" className="btn-ghost" onClick={() => void downloadFile(`/platform/exports/${exportId}`, `export-${name}.zip`).catch((e: Error) => toast.error(e.message))}><Download className="h-4 w-4" aria-hidden="true" /> {t('platform.support.download')}</button>}
        </div>
      </div>
    </section>
  );
}
