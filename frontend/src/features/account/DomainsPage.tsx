import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Globe2, Star, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Alert, Badge, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';

interface DomainRow { id: number; domain: string; type: 'subdomain' | 'custom'; is_primary: boolean; verified: boolean }
interface Domains { domains: DomainRow[]; enabled: boolean; cname_target: string; ips: string[]; max: number }

/** Dashboard → Domain: connect your own web address. */
export default function DomainsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['domains'], queryFn: async () => (await api.get<Domains>('/tenant/domains')).data });
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const set = (d: Domains) => qc.setQueryData(['domains'], d);
  const add = useMutation<Domains, ApiError>({
    mutationFn: async () => (await api.post<Domains>('/tenant/domains', { domain })).data,
    onSuccess: (d) => { set(d); setDomain(''); setError(''); },
    onError: (e) => setError(e.message),
  });
  const act = useMutation<Domains, ApiError, { id: number; action: 'verify' | 'primary' | 'delete' }>({
    mutationFn: async ({ id, action }) => (action === 'delete' ? await api.delete<Domains>(`/tenant/domains/${id}`) : await api.post<Domains>(`/tenant/domains/${id}/${action}`)).data,
    onSuccess: (d, v) => { set(d); toast.success(t(`domains.done.${v.action}`)); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading) return <SkeletonRows rows={4} />;
  if (q.isError || !q.data) return <ErrorState message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const custom = d.domains.filter((x) => x.type === 'custom');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight"><Globe2 className="h-7 w-7" aria-hidden="true" /> {t('domains.title')}</h1>
        <p className="text-muted">{t('domains.subtitle')}</p>
      </div>
      {!d.enabled && <Alert tone="info">{t('domains.upgrade')}</Alert>}
      <ul className="card divide-y divide-line">
        {d.domains.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <span className="flex flex-wrap items-center gap-2">
              <b className="break-all">{x.domain}</b>
              {x.is_primary && <Badge tone="confirmed">{t('domains.primary')}</Badge>}
              {x.type === 'custom' && (x.verified ? <Badge tone="paid">{t('domains.verified')}</Badge> : <Badge tone="pending">{t('domains.waiting')}</Badge>)}
              {x.type === 'subdomain' && <span className="text-xs text-muted">{t('domains.free')}</span>}
            </span>
            {x.type === 'custom' && (
              <span className="flex flex-wrap gap-2">
                {!x.verified && <button type="button" className="btn-primary !min-h-10 text-sm" disabled={act.isPending} onClick={() => act.mutate({ id: x.id, action: 'verify' })}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {t('domains.check')}</button>}
                {x.verified && !x.is_primary && <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => act.mutate({ id: x.id, action: 'primary' })}><Star className="h-4 w-4" aria-hidden="true" /> {t('domains.makePrimary')}</button>}
                <button type="button" className="btn-ghost !min-h-10 !px-2 text-danger" onClick={() => window.confirm(t('domains.removeConfirm', { domain: x.domain })) && act.mutate({ id: x.id, action: 'delete' })} aria-label={t('domains.remove', { domain: x.domain })}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {d.enabled && custom.length < d.max && (
        <form className="card space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <Field label={t('domains.add')} hint={t('domains.addHint')} error={error}>{(a) => <input {...a} className="field-input" placeholder="www.yourrestaurant.in" inputMode="url" autoCapitalize="none" value={domain} onChange={(e) => setDomain(e.target.value)} />}</Field>
          <button type="submit" className="btn-primary" disabled={!domain.trim() || add.isPending}>{add.isPending ? <Spinner /> : t('domains.connect')}</button>
        </form>
      )}
      {d.enabled && (
        <section className="card space-y-2 p-5 text-sm" aria-labelledby="dns-h">
          <h2 id="dns-h" className="text-lg font-bold">{t('domains.howTitle')}</h2>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>{t('domains.step1')}</li>
            <li>{t('domains.step2')} <code className="rounded bg-ink/5 px-1.5 py-0.5">CNAME</code> → <code className="rounded bg-ink/5 px-1.5 py-0.5">{d.cname_target}</code></li>
            {!!d.ips.length && <li>{t('domains.step2a')} <code className="rounded bg-ink/5 px-1.5 py-0.5">A</code> → {d.ips.map((ip) => <code key={ip} className="mr-1 rounded bg-ink/5 px-1.5 py-0.5">{ip}</code>)}</li>}
            <li>{t('domains.step3')}</li>
            <li>{t('domains.step4')}</li>
          </ol>
        </section>
      )}
    </div>
  );
}
