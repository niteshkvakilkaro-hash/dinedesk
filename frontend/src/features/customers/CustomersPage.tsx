import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOpenParam, useTabParam } from '@/lib/urlParams';
import { MessageSquareHeart, Search, Star, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatMoney, formatPhone } from '@/lib/format';
import { useCan, useFeature } from '@/hooks/useSession';
import { Badge, Dialog, EmptyState, ErrorState, Field, SkeletonRows, Spinner, toast, Toggle } from '@/components/ui';

interface Row { id: number; name: string; phone: string | null; email: string | null; orders_count: number; visits: number; total_spent: string; loyalty_points: number; tags: string[]; marketing_opt_in: boolean; last_order_at: string | null; created_at: string }
interface Detail extends Row {
  notes: string | null; birthday: string | null; anniversary: string | null; dates_opt_in: boolean; marketing_opt_in_at: string | null;
  orders: { id: number; number: number; type: string; status: string; total: string; placed_at: string }[];
  bookings: { code: string; date: string; time: string; party_size: number; status: string }[];
  points: { type: string; points: number; balance_after: number; note: string | null; at: string }[];
  feedback: { rating: number; comment: string | null; at: string }[];
}
interface FeedbackItem { id: number; rating: number; food: number | null; service: number | null; comment: string | null; name: string | null; consent_public: boolean; is_published: boolean; reply: string | null; order_number: number | null; created_at: string }

const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—');

function CustomerDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const hasLoyalty = useFeature('loyalty');
  const canMarketing = useCan('marketing.manage');
  const q = useQuery({ queryKey: ['customer', id], queryFn: async () => (await api.get<Detail>(`/tenant/customers/${id}`)).data, enabled: !!id });
  const c = q.data;
  const [f, setF] = useState({ tags: '', notes: '', birthday: '', anniversary: '', dates_opt_in: false, marketing_opt_in: false });
  const [adjust, setAdjust] = useState({ points: '', note: '' });
  useEffect(() => { if (c) setF({ tags: c.tags.join(', '), notes: c.notes ?? '', birthday: c.birthday ?? '', anniversary: c.anniversary ?? '', dates_opt_in: c.dates_opt_in, marketing_opt_in: c.marketing_opt_in }); }, [c]);
  const save = useMutation<{ data: Detail }, ApiError>({
    mutationFn: () => api.put<Detail>(`/tenant/customers/${id}`, { tags: f.tags.split(',').map((s) => s.trim()).filter(Boolean), notes: f.notes || null, birthday: f.dates_opt_in ? f.birthday || null : null, anniversary: f.dates_opt_in ? f.anniversary || null : null, dates_opt_in: f.dates_opt_in, marketing_opt_in: f.marketing_opt_in }),
    onSuccess: (r) => { qc.setQueryData(['customer', id], r.data); void qc.invalidateQueries({ queryKey: ['customers'] }); toast.success(t('common.saved')); },
    onError: (e) => toast.error(e.errors ? Object.values(e.errors)[0][0] : e.message),
  });
  const adjustPoints = useMutation<unknown, ApiError>({
    mutationFn: () => api.post(`/tenant/loyalty/customers/${id}/adjust`, { points: Number(adjust.points), note: adjust.note }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['customer', id] }); setAdjust({ points: '', note: '' }); toast.success(t('common.saved')); },
    onError: (e) => toast.error(e.message),
  });
  if (!id) return null;
  return (
    <Dialog open onClose={onClose} title={c?.name ?? t('common.loading')} wide>
      {q.isLoading && <Spinner />}
      {c && (
        <div className="space-y-5">
          <p className="text-sm text-muted">{[c.phone && formatPhone(c.phone), c.email].filter(Boolean).join(' · ')}</p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[[t('customers.spent'), formatMoney(c.total_spent)], [t('customers.visits'), c.visits], [t('customers.orders'), c.orders_count], [t('customers.points'), c.loyalty_points]].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl bg-ink/5 p-3"><dt className="text-xs text-muted">{k}</dt><dd className="text-lg font-extrabold tabular-nums">{v}</dd></div>
            ))}
          </dl>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('customers.tags')} hint={t('customers.tagsHint')}>{(a) => <input {...a} className="field-input" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />}</Field>
              <Field label={t('customers.notes')} optional>{(a) => <input {...a} className="field-input" maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />}</Field>
            </div>
            <Toggle checked={f.dates_opt_in} onChange={(v) => setF({ ...f, dates_opt_in: v })} label={t('customers.datesOptIn')} hint={t('customers.datesOptInHint')} />
            {f.dates_opt_in && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('customers.birthday')} optional>{(a) => <input {...a} type="date" className="field-input" value={f.birthday} onChange={(e) => setF({ ...f, birthday: e.target.value })} />}</Field>
                <Field label={t('customers.anniversary')} optional>{(a) => <input {...a} type="date" className="field-input" value={f.anniversary} onChange={(e) => setF({ ...f, anniversary: e.target.value })} />}</Field>
              </div>
            )}
            {c.marketing_opt_in ? <Toggle checked={f.marketing_opt_in} onChange={(v) => setF({ ...f, marketing_opt_in: v })} label={t('customers.optIn')} hint={c.marketing_opt_in_at ? t('customers.optInSince', { date: day(c.marketing_opt_in_at) }) : t('customers.optInHint')} /> : <p className="py-2 text-sm text-muted">{t('customers.notOptedIn')}</p>}
            <div className="flex justify-end"><button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button></div>
          </form>

          <section>
            <h3 className="mb-2 font-bold">{t('customers.history')}</h3>
            <ul className="max-h-48 divide-y divide-line overflow-y-auto text-sm">
              {c.orders.length === 0 && <li className="py-2 text-muted">{t('customers.noOrders')}</li>}
              {c.orders.map((o) => <li key={o.id} className="flex gap-3 py-2"><span className="font-bold tabular-nums">#{o.number}</span><span className="text-muted">{day(o.placed_at)} · {t(`order.type.${o.type}`)}</span><Badge tone={o.status}>{t(`order.status.${o.status}`)}</Badge><span className="ml-auto tabular-nums">{formatMoney(o.total)}</span></li>)}
              {c.bookings.map((b) => <li key={b.code} className="flex gap-3 py-2"><span className="font-mono">{b.code}</span><span className="text-muted">{b.date} {b.time} · {t('reservationsAdmin.guests', { count: b.party_size })}</span><span className="ml-auto">{t(`site.res.status.${b.status}`)}</span></li>)}
            </ul>
          </section>

          {hasLoyalty && (
            <section>
              <h3 className="mb-2 font-bold">{t('customers.pointsHistory')}</h3>
              <ul className="max-h-40 divide-y divide-line overflow-y-auto text-sm">
                {c.points.length === 0 && <li className="py-2 text-muted">{t('customers.noPoints')}</li>}
                {c.points.map((p, i) => <li key={i} className="flex gap-3 py-1.5"><span className="text-muted">{day(p.at)}</span><span className="flex-1">{p.note}</span><span className={`tabular-nums font-semibold ${p.points < 0 ? 'text-danger' : 'text-success'}`}>{p.points > 0 ? '+' : ''}{p.points}</span><span className="w-12 text-right tabular-nums text-muted">{p.balance_after}</span></li>)}
              </ul>
              {canMarketing && (
                <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); adjustPoints.mutate(); }}>
                  <input className="field-input !w-28 !py-2" type="number" aria-label={t('customers.adjustPoints')} placeholder="+50 / −20" value={adjust.points} onChange={(e) => setAdjust({ ...adjust, points: e.target.value })} />
                  <input className="field-input flex-1 !py-2" aria-label={t('customers.adjustReason')} placeholder={t('customers.adjustReason')} value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
                  <button type="submit" className="btn-outline !min-h-10 text-sm" disabled={!Number(adjust.points) || !adjust.note || adjustPoints.isPending}>{t('customers.adjustPoints')}</button>
                </form>
              )}
            </section>
          )}
        </div>
      )}
    </Dialog>
  );
}

function CustomersTab() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  useOpenParam((v) => Number(v) > 0 && setOpen(Number(v)));
  useEffect(() => { const id = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(id); }, [search]);
  const list = useQuery({
    queryKey: ['customers', q, tag, sort, page],
    queryFn: async () => {
      const res = await api.get<Row[]>('/tenant/customers', { q: q || undefined, tag: tag || undefined, sort, page });
      return { rows: res.data, meta: res.meta as { current_page: number; last_page: number; total: number; tags: string[]; opted_in: number } };
    },
    placeholderData: keepPreviousData,
  });
  const m = list.data?.meta;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input type="search" className="field-input !pl-9" placeholder={t('customers.search')} aria-label={t('customers.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <select className="field-input !w-auto" aria-label={t('customers.tags')} value={tag} onChange={(e) => { setTag(e.target.value); setPage(1); }}><option value="">{t('customers.allTags')}</option>{m?.tags.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <select className="field-input !w-auto" aria-label={t('customers.sort')} value={sort} onChange={(e) => setSort(e.target.value)}>{['recent', 'spend', 'visits', 'points', 'name'].map((s) => <option key={s} value={s}>{t(`customers.sorts.${s}`)}</option>)}</select>
        {m && <p className="ml-auto text-sm text-muted">{t('customers.summary', { total: m.total, opted: m.opted_in })}</p>}
      </div>
      {list.isLoading && <SkeletonRows rows={6} />}
      {list.isError && <ErrorState message={(list.error as Error).message} onRetry={() => void list.refetch()} />}
      {list.data && !list.data.rows.length && <EmptyState title={t('customers.empty')}>{t('customers.emptyHint')}</EmptyState>}
      {list.data && list.data.rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th className="p-3">{t('order.name')}</th><th className="p-3">{t('order.phone')}</th><th className="p-3 text-right">{t('customers.visits')}</th><th className="p-3 text-right">{t('customers.spent')}</th><th className="p-3 text-right">{t('customers.points')}</th><th className="p-3">{t('customers.lastOrder')}</th><th className="p-3">{t('customers.tags')}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {list.data.rows.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-ink/[0.03]" onClick={() => setOpen(c.id)}>
                  <td className="p-3"><button type="button" className="font-semibold hover:underline" onClick={() => setOpen(c.id)}>{c.name}</button>{c.marketing_opt_in && <Badge tone="paid">{t('customers.optedIn')}</Badge>}</td>
                  <td className="p-3 tabular-nums text-muted">{c.phone ? formatPhone(c.phone) : '—'}</td>
                  <td className="p-3 text-right tabular-nums">{c.visits}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">{formatMoney(c.total_spent)}</td>
                  <td className="p-3 text-right tabular-nums">{c.loyalty_points}</td>
                  <td className="p-3 text-muted">{day(c.last_order_at)}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-1">{c.tags.map((x) => <Badge key={x} tone="unpaid">{x}</Badge>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {m && m.last_page > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('common.previous')}</button>
          <span className="text-sm">{t('common.pageOf', { page: m.current_page, total: m.last_page })}</span>
          <button type="button" className="btn-ghost" disabled={page >= m.last_page} onClick={() => setPage(page + 1)}>{t('common.next')}</button>
        </div>
      )}
      <CustomerDialog id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function FeedbackTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [rating, setRating] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['feedback', rating], queryFn: async () => (await api.get<{ items: FeedbackItem[]; summary: { count: number; average: number | null; by_rating: Record<string, number>; published: number } }>('/tenant/feedback', { rating: rating ?? undefined })).data });
  const [replying, setReplying] = useState<FeedbackItem | null>(null);
  const [reply, setReply] = useState('');
  const update = useMutation<unknown, ApiError, { id: number; body: Record<string, unknown> }>({
    mutationFn: ({ id, body }) => api.put(`/tenant/feedback/${id}`, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['feedback'] }); setReplying(null); toast.success(t('common.saved')); },
    onError: (e) => toast.error(e.message),
  });
  const s = q.data?.summary;
  return (
    <div className="space-y-4">
      {s && (
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-3xl font-extrabold tabular-nums">{s.average ?? '—'}</p>
          <div className="text-sm text-muted">{t('customers.feedbackSummary', { count: s.count, published: s.published })}</div>
          <div className="ml-auto flex gap-1">
            {[null, 5, 4, 3, 2, 1].map((r) => <button key={r ?? 'all'} type="button" aria-pressed={rating === r} onClick={() => setRating(r)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${rating === r ? 'border-ink bg-ink text-paper' : 'border-line'}`}>{r ? `${r}★ (${s.by_rating[r] ?? 0})` : t('reservationsAdmin.all')}</button>)}
          </div>
        </div>
      )}
      {q.data && !q.data.items.length && <EmptyState title={t('customers.noFeedback')}>{t('customers.noFeedbackHint')}</EmptyState>}
      <ul className="space-y-3">
        {q.data?.items.map((f) => (
          <li key={f.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex" role="img" aria-label={t('site.reviews.stars', { count: f.rating })}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= f.rating ? 'fill-gold text-gold' : 'text-line'}`} aria-hidden="true" />)}</span>
              <span className="text-sm font-semibold">{f.name ?? t('site.reviews.guest')}</span>
              {f.order_number && <span className="text-sm text-muted">#{f.order_number}</span>}
              <span className="text-sm text-muted">{day(f.created_at)}</span>
              {f.is_published && <Badge tone="paid">{t('customers.onWebsite')}</Badge>}
              {!f.consent_public && <Badge tone="unpaid">{t('customers.private')}</Badge>}
            </div>
            {f.comment && <p className="mt-2">“{f.comment}”</p>}
            {f.reply && <p className="mt-2 border-l-2 border-line pl-3 text-sm text-muted">{f.reply}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {f.consent_public && <button type="button" className="btn-outline !min-h-9 text-xs" onClick={() => update.mutate({ id: f.id, body: { is_published: !f.is_published } })}>{f.is_published ? t('customers.unpublish') : t('customers.publish')}</button>}
              <button type="button" className="btn-ghost !min-h-9 text-xs" onClick={() => { setReplying(f); setReply(f.reply ?? ''); }}>{f.reply ? t('customers.editReply') : t('customers.reply')}</button>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!replying} onClose={() => setReplying(null)} title={t('customers.reply')}>
        <textarea className="field-input" rows={4} maxLength={600} value={reply} onChange={(e) => setReply(e.target.value)} aria-label={t('customers.reply')} data-autofocus />
        <p className="mt-2 text-xs text-muted">{t('customers.replyHint')}</p>
        <div className="mt-4 flex justify-end"><button type="button" className="btn-primary" disabled={update.isPending} onClick={() => replying && update.mutate({ id: replying.id, body: { reply: reply || null } })}>{t('common.save')}</button></div>
      </Dialog>
    </div>
  );
}

export default function CustomersPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(['customers', 'feedback'] as const, 'customers');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">{tab === 'customers' ? <Users className="h-7 w-7" aria-hidden="true" /> : <MessageSquareHeart className="h-7 w-7" aria-hidden="true" />} {t('customers.title')}</h1>
          <p className="text-muted">{t('customers.subtitle')}</p>
        </div>
        <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="tablist">
          {(['customers', 'feedback'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-surface shadow' : 'text-muted'}`}>{t(`customers.tab.${k}`)}</button>)}
        </div>
      </div>
      {tab === 'customers' ? <CustomersTab /> : <FeedbackTab />}
    </div>
  );
}
