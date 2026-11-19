import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { whatsappUrl } from '@/lib/publicConfig';
import { Badge, EmptyState, ErrorState, SkeletonRows } from '@/components/ui';

interface ChatRow {
  id: string;
  name: string | null;
  phone: string | null;
  business: string | null;
  page: string | null;
  status: 'new' | 'seen' | 'closed';
  count: number;
  last_text: string | null;
  last_message_at: string | null;
}
interface ChatDetail extends ChatRow {
  messages: { role: 'visitor' | 'bot'; text: string; at: string }[];
}

/** Super admin → Chats: conversations with the NikoBite assistant, to follow up on WhatsApp. */
export default function ChatsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'' | 'new' | 'closed'>('');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['platform', 'chats', status],
    queryFn: async () => api.get<ChatRow[]>('/platform/chats', status ? { status } : undefined),
    refetchInterval: 30_000,
  });
  const detail = useQuery({
    queryKey: ['platform', 'chat', openId],
    enabled: !!openId,
    queryFn: async () => {
      const r = (await api.get<ChatDetail>(`/platform/chats/${openId}`)).data;
      void qc.invalidateQueries({ queryKey: ['platform', 'chats'] });
      return r;
    },
  });
  const setChatStatus = useMutation({
    mutationFn: async (s: ChatRow['status']) => api.patch(`/platform/chats/${openId}`, { status: s }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'chats'] });
      void qc.invalidateQueries({ queryKey: ['platform', 'chat', openId] });
    },
  });

  const rows = list.data?.data ?? [];
  const newCount = (list.data?.meta as { new?: number } | undefined)?.new ?? 0;
  const when = (iso: string | null) => (iso ? formatDateTime(iso) : '');
  const d = detail.data;
  const wa = d?.phone ? whatsappUrl(d.phone.replace(/\D/g, ''), t('platform.chats.waText', { name: d.name ?? '' })) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <MessageCircle className="h-6 w-6" aria-hidden="true" /> {t('platform.chats.title')}
            {newCount > 0 && <Badge tone="past_due">{t('platform.chats.newCount', { count: newCount })}</Badge>}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('platform.chats.lead')}</p>
        </div>
        <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="radiogroup" aria-label={t('platform.chats.title')}>
          {(['', 'new', 'closed'] as const).map((s) => (
            <button key={s || 'all'} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${status === s ? 'bg-surface shadow' : 'text-muted'}`}>
              {t(`platform.chats.filter.${s || 'all'}`)}
            </button>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <SkeletonRows rows={6} />
      ) : list.isError ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => void list.refetch()} />
      ) : !rows.length ? (
        <EmptyState title={t('platform.chats.empty')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <ul className="card divide-y divide-line overflow-hidden p-0">
            {rows.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setOpenId(c.id)} className={`flex w-full flex-col gap-1 px-4 py-3 text-start hover:bg-paper ${openId === c.id ? 'bg-paper' : ''}`} aria-current={openId === c.id}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-bold">{c.name || c.business || t('platform.chats.visitor')}</span>
                    <span className="shrink-0 text-xs text-muted">{when(c.last_message_at)}</span>
                  </span>
                  <span className="truncate text-sm text-muted">{c.last_text}</span>
                  <span className="flex items-center gap-2 text-xs">
                    {c.status === 'new' && <Badge tone="onboarding">{t('platform.chats.filter.new')}</Badge>}
                    {c.status === 'closed' && <Badge tone="closed">{t('platform.chats.filter.closed')}</Badge>}
                    {c.phone && <span className="flex items-center gap-1 text-muted"><Phone className="h-3 w-3" aria-hidden="true" />{c.phone}</span>}
                    <span className="text-muted">{t('platform.chats.messages', { count: c.count })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <section className="card flex min-h-[24rem] flex-col p-0" aria-live="polite">
            {!openId ? (
              <p className="m-auto p-6 text-sm text-muted">{t('platform.chats.pick')}</p>
            ) : detail.isLoading || !d ? (
              <div className="p-5"><SkeletonRows rows={4} /></div>
            ) : (
              <>
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-extrabold">{d.name || d.business || t('platform.chats.visitor')}</p>
                    <p className="truncate text-xs text-muted">{[d.business, d.phone, d.page].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex gap-2">
                    {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn !min-h-9 !px-3 bg-[#25d366] text-sm font-bold text-white">{t('platform.chats.reply')}</a>}
                    <button type="button" className="btn-outline !min-h-9 !px-3 text-sm" disabled={setChatStatus.isPending} onClick={() => setChatStatus.mutate(d.status === 'closed' ? 'seen' : 'closed')}>
                      {t(d.status === 'closed' ? 'platform.chats.reopen' : 'platform.chats.close')}
                    </button>
                  </div>
                </header>
                <div className="flex-1 space-y-3 overflow-y-auto bg-paper px-5 py-4">
                  {d.messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'visitor' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.role === 'visitor' ? 'border border-line bg-surface' : 'bg-ink text-paper'}`}>
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <p className={`mt-1 text-[10px] ${m.role === 'visitor' ? 'text-muted' : 'text-paper/60'}`}>{m.role === 'visitor' ? t('platform.chats.visitor') : t('platform.chats.bot')} · {when(m.at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
