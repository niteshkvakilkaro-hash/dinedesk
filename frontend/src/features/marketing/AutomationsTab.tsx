import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Cake, Heart, UserRoundX } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Alert, ErrorState, Field, SkeletonRows, Spinner, toast, Toggle } from '@/components/ui';

type Kind = 'birthday' | 'anniversary' | 'winback';
interface Settings {
  channel: 'whatsapp' | 'email';
  birthday: { enabled: boolean; message: string };
  anniversary: { enabled: boolean; message: string };
  winback: { enabled: boolean; days: number; message: string };
}
interface Payload {
  settings: Settings;
  due_today: Record<Kind, number>;
  sent_30_days: Partial<Record<Kind, number>>;
}

const ICONS = { birthday: Cake, anniversary: Heart, winback: UserRoundX };

/** Automatic messages: switched on once, sent every morning to opted-in customers only. */
export function AutomationsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['automations'], queryFn: async () => (await api.get<Payload>('/tenant/marketing/automations')).data });
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    if (query.data) setS(query.data.settings);
  }, [query.data]);
  const save = useMutation<{ data: Payload }, ApiError, Settings>({
    mutationFn: (body) => api.put<Payload>('/tenant/marketing/automations', body),
    onSuccess: (res) => {
      qc.setQueryData(['automations'], res.data);
      toast.success(t('common.saved'));
    },
    onError: (e) => toast.error(e.errors ? Object.values(e.errors)[0][0] : e.message),
  });
  if (query.isError) return <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />;
  if (!query.data || !s) return <SkeletonRows rows={4} />;
  const up = <K extends Kind>(k: K, patch: Partial<Settings[K]>) => setS({ ...s, [k]: { ...s[k], ...patch } });

  return (
    <form className="max-w-3xl space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate(s); }}>
      <Alert tone="info">{t('automations.intro')}</Alert>
      <section className="card p-5">
        <Field label={t('automations.channel')} hint={t('automations.channelHint')}>
          {(a) => (
            <select {...a} className="field-input" value={s.channel} onChange={(e) => setS({ ...s, channel: e.target.value as Settings['channel'] })}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">{t('automations.email')}</option>
            </select>
          )}
        </Field>
      </section>
      {(['birthday', 'anniversary', 'winback'] as const).map((k) => {
        const Icon = ICONS[k];
        return (
          <section key={k} className={`card space-y-4 p-5 ${s[k].enabled ? '!border-success' : ''}`} aria-labelledby={`auto-${k}`}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={`auto-${k}`} className="text-lg font-bold">
                  {t(`automations.${k}.title`)}
                </h2>
                <p className="text-sm text-muted">{t(`automations.${k}.hint`)}</p>
              </div>
            </div>
            <Toggle checked={s[k].enabled} onChange={(v) => up(k, { enabled: v })} label={t('automations.on')} hint={t('automations.stats', { today: query.data.due_today[k], sent: query.data.sent_30_days[k] ?? 0 })} />
            {k === 'winback' && (
              <Field label={t('automations.winback.days')}>
                {(a) => <input {...a} type="number" min={14} max={180} className="field-input w-32" value={s.winback.days} onChange={(e) => up('winback', { days: Number(e.target.value) })} />}
              </Field>
            )}
            <Field label={t('automations.message')} hint={t('automations.messageHint')}>
              {(a) => <textarea {...a} rows={2} maxLength={500} className="field-input" value={s[k].message} onChange={(e) => up(k, { message: e.target.value })} />}
            </Field>
          </section>
        );
      })}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : t('common.save')}
        </button>
      </div>
    </form>
  );
}
