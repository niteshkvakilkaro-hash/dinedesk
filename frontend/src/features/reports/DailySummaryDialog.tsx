import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Mail, MessageCircle, Send } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { intlLocale } from '@/i18n/locale';
import { useSession } from '@/hooks/useSession';
import { Dialog, ErrorState, SkeletonRows, Spinner, toast, Toggle } from '@/components/ui';

interface Settings { enabled: boolean; whatsapp: boolean; email: boolean; hour: number }
interface Payload {
  settings: Settings;
  hours: number[];
  timezone: string;
  last_sent_on: string | null;
  owner: { name: string; phone: string | null; email: string | null; locale: string } | null;
  preview: string;
}

const KEY = ['daily-summary'];

/** Reports → "Morning summary": yesterday's numbers to the owner on WhatsApp and/or email. */
export function DailySummaryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  // The summary goes to the owner: they add their mobile number in My account.
  const isOwner = useSession().data?.role === 'owner';
  const query = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<Payload>('/tenant/reports/daily-summary')).data, enabled: open });
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    if (query.data) setS(query.data.settings);
  }, [query.data]);
  const fail = (e: ApiError) => toast.error(e.errors ? Object.values(e.errors)[0][0] : e.message);
  const save = useMutation<{ data: Payload }, ApiError, Settings>({
    mutationFn: (body) => api.put<Payload>('/tenant/reports/daily-summary', body),
    onSuccess: (res) => {
      qc.setQueryData(KEY, res.data);
      toast.success(t('common.saved'));
      onClose();
    },
    onError: fail,
  });
  const test = useMutation<unknown, ApiError>({
    mutationFn: () => api.post('/tenant/reports/daily-summary/test'),
    onSuccess: () => toast.success(t('reports.daily.testSent')),
    onError: fail,
  });
  const time = (h: number) => new Intl.DateTimeFormat(intlLocale(i18n.language), { hour: 'numeric', minute: '2-digit' }).format(new Date(2026, 0, 1, h));
  const d = query.data;
  const noChannel = !!s && s.enabled && !s.whatsapp && !s.email;

  return (
    <Dialog open={open} onClose={onClose} title={t('reports.daily.title')} wide>
      {query.isError && <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />}
      {!d || !s ? (
        !query.isError && <SkeletonRows rows={4} />
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!noChannel) save.mutate(s); }}>
          <p className="text-sm text-muted">{t('reports.daily.intro')}</p>
          <Toggle checked={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} label={t('reports.daily.on')} hint={t('reports.daily.offHint')} />

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{t('reports.daily.channels')}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${s.whatsapp ? 'border-ink' : 'border-line'}`}>
                <input type="checkbox" className="mt-1 h-4 w-4 accent-current" checked={s.whatsapp} onChange={(e) => setS({ ...s, whatsapp: e.target.checked })} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold"><MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp</span>
                  <span className="block break-words text-xs text-muted">
                    {d.owner?.phone ?? t('reports.daily.noPhone')}
                    {!d.owner?.phone && isOwner && (
                      <> <Link to="/dashboard/account?open=mobile" className="font-semibold text-ink underline">{t('reports.daily.addPhone')}</Link></>
                    )}
                  </span>
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${s.email ? 'border-ink' : 'border-line'}`}>
                <input type="checkbox" className="mt-1 h-4 w-4 accent-current" checked={s.email} onChange={(e) => setS({ ...s, email: e.target.checked })} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold"><Mail className="h-4 w-4" aria-hidden="true" /> {t('reports.daily.email')}</span>
                  <span className="block break-all text-xs text-muted">{d.owner?.email ?? t('reports.daily.noEmail')}</span>
                </span>
              </label>
            </div>
            {noChannel && <p className="text-sm font-semibold text-danger" role="alert">{t('reports.daily.chooseChannel')}</p>}
          </fieldset>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="block text-sm font-semibold">{t('reports.daily.hour')}</span>
              <select className="field-input mt-1 !w-auto" value={s.hour} onChange={(e) => setS({ ...s, hour: Number(e.target.value) })}>
                {d.hours.map((h) => <option key={h} value={h}>{time(h)}</option>)}
              </select>
            </label>
            <p className="pb-2 text-xs text-muted">{t('reports.daily.hourHint', { tz: d.timezone })}</p>
          </div>
          <p className="text-xs text-muted">{t('reports.daily.language', { name: d.owner?.name ?? '' })}</p>

          <section aria-labelledby="daily-preview" className="rounded-2xl bg-ink/5 p-3">
            <h3 id="daily-preview" className="text-xs font-semibold uppercase tracking-wide text-muted">{t('reports.daily.preview')}</h3>
            <p className="mt-1 whitespace-pre-line break-words text-sm">{d.preview}</p>
            {d.last_sent_on && <p className="mt-2 text-xs text-muted">{t('reports.daily.lastSent', { date: d.last_sent_on })}</p>}
          </section>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" className="btn-outline" disabled={test.isPending} onClick={() => test.mutate()} title={t('reports.daily.testHint')}>
              {test.isPending ? <Spinner /> : <Send className="h-4 w-4" aria-hidden="true" />} {t('reports.daily.test')}
            </button>
            <button type="submit" className="btn-primary" disabled={save.isPending || noChannel}>
              {save.isPending ? <Spinner /> : t('common.save')}
            </button>
          </div>
          <p className="text-xs text-muted">{t('reports.daily.testHint')}</p>
        </form>
      )}
    </Dialog>
  );
}
