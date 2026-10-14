import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Gift, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { describeAlert, type InAppAlert } from './alertText';

/** Unread in-app alerts for this person (e.g. a referral reward), each with a link and "Hide". */
export function InAppAlerts({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['in-app-alerts'],
    queryFn: async () => (await api.get<InAppAlert[]>('/tenant/alerts')).data,
    enabled,
    staleTime: 5 * 60_000,
  });
  const hide = useMutation({
    mutationFn: (id: string) => api.post(`/tenant/alerts/${id}/read`),
    onMutate: (id) => qc.setQueryData<InAppAlert[]>(['in-app-alerts'], (list) => list?.filter((a) => a.id !== id)),
  });
  const views = (data ?? []).flatMap((a) => {
    const view = describeAlert(a, t, (iso) => formatDate(iso));
    return view ? [{ id: a.id, ...view }] : [];
  });
  if (!views.length) return null;

  return (
    <ul className="mb-5 space-y-2" aria-label={t('inAppAlerts.title')}>
      {views.map((v) => (
        <li key={v.id} role="status" className="flex items-start gap-2.5 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
          <Gift className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            {v.text}{' '}
            <Link to={v.to} className="font-bold underline" onClick={() => hide.mutate(v.id)}>{v.linkLabel}</Link>
          </p>
          <button type="button" className="-m-1 rounded p-1 hover:bg-black/5" aria-label={t('inAppAlerts.hide')} title={t('inAppAlerts.hide')} onClick={() => hide.mutate(v.id)}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
