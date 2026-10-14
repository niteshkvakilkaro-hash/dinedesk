import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTabParam } from '@/lib/urlParams';
import { Copy, Gift, Megaphone, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useFeature } from '@/hooks/useSession';
import { AutomationsTab } from './AutomationsTab';
import { Alert, Badge, Dialog, EmptyState, Field, SkeletonRows, Spinner, toast, Toggle } from '@/components/ui';

interface Coupon { id: number; code: string; description: string | null; type: 'flat' | 'percent'; value: string; max_discount: string | null; min_order: string; starts_at: string | null; ends_at: string | null; usage_limit: number | null; per_customer_limit: number | null; used_count: number; online: boolean; pos: boolean; is_public: boolean; is_active: boolean; discount_given?: string }
interface Banner { id: number; placement: 'bar' | 'popup' | 'offer'; title: string; title_hi: string | null; text: string | null; text_hi: string | null; cta_label: string | null; cta_link: string | null; coupon_code: string | null; starts_at: string | null; ends_at: string | null; is_active: boolean; live: boolean }
interface GiftCardRow { id: number; code: string; initial_value: string; balance: string; issued_to: string | null; phone: string | null; status: 'active' | 'void'; expires_on: string | null; created_at: string }
interface LoyaltySettings { enabled: boolean; earn_per_100: number; point_value: number; min_redeem: number; max_redeem_percent: number }

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const fmtDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '');
const errs = (e: ApiError) => (e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k.split('.').pop()!, v[0]])) : { form: e.message });

// ---------- Coupons ----------

function CouponDialog({ coupon, onClose }: { coupon: Coupon | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const c = coupon === 'new' ? null : coupon;
  const blank = { code: '', description: '', type: 'percent' as 'flat' | 'percent', value: '10', max_discount: '', min_order: '', starts_at: '', ends_at: '', usage_limit: '', per_customer_limit: '1', online: true, pos: true, is_public: false, is_active: true };
  const [f, setF] = useState(blank);
  const [e, setE] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!coupon) return;
    setE({});
    setF(c ? { code: c.code, description: c.description ?? '', type: c.type, value: String(Number(c.value)), max_discount: c.max_discount ? String(Number(c.max_discount)) : '', min_order: Number(c.min_order) ? String(Number(c.min_order)) : '', starts_at: toLocal(c.starts_at), ends_at: toLocal(c.ends_at), usage_limit: c.usage_limit ? String(c.usage_limit) : '', per_customer_limit: c.per_customer_limit ? String(c.per_customer_limit) : '', online: c.online, pos: c.pos, is_public: c.is_public, is_active: c.is_active } : blank);
  }, [coupon]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => {
      const n = (v: string) => (v === '' ? null : Number(v));
      const body = { ...f, value: Number(f.value), max_discount: f.type === 'percent' ? n(f.max_discount) : null, min_order: n(f.min_order) ?? 0, usage_limit: n(f.usage_limit), per_customer_limit: n(f.per_customer_limit), starts_at: fromLocal(f.starts_at), ends_at: fromLocal(f.ends_at), description: f.description || null };
      return c ? api.put(`/tenant/marketing/coupons/${c.id}`, body) : api.post('/tenant/marketing/coupons', body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['coupons'] }); toast.success(t('common.saved')); onClose(); },
    onError: (x) => setE(errs(x)),
  });
  if (!coupon) return null;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  return (
    <Dialog open onClose={onClose} title={c ? t('marketing.editCoupon', { code: c.code }) : t('marketing.newCoupon')} wide>
      <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); save.mutate(); }} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('marketing.code')} hint={t('marketing.codeHint')} error={e.code}>{(a) => <input {...a} className="field-input font-mono uppercase" maxLength={30} value={f.code} onChange={(x) => set('code', x.target.value)} data-autofocus />}</Field>
          <Field label={t('marketing.description')} optional>{(a) => <input {...a} className="field-input" maxLength={200} value={f.description} onChange={(x) => set('description', x.target.value)} />}</Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Field label={t('marketing.type')}>{(a) => <select {...a} className="field-input" value={f.type} onChange={(x) => set('type', x.target.value as 'flat' | 'percent')}><option value="percent">{t('marketing.percent')}</option><option value="flat">{t('marketing.flat')}</option></select>}</Field>
          <Field label={f.type === 'percent' ? t('marketing.valuePercent') : t('marketing.valueFlat')} error={e.value}>{(a) => <input {...a} type="number" min={1} max={100000} className="field-input" value={f.value} onChange={(x) => set('value', x.target.value)} />}</Field>
          {f.type === 'percent' && <Field label={t('marketing.maxDiscount')} optional>{(a) => <input {...a} type="number" min={1} className="field-input" value={f.max_discount} onChange={(x) => set('max_discount', x.target.value)} />}</Field>}
          <Field label={t('marketing.minOrder')} optional hint={t('marketing.minOrderHint')}>{(a) => <input {...a} type="number" min={0} className="field-input" value={f.min_order} onChange={(x) => set('min_order', x.target.value)} />}</Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Field label={t('marketing.starts')} optional>{(a) => <input {...a} type="datetime-local" className="field-input" value={f.starts_at} onChange={(x) => set('starts_at', x.target.value)} />}</Field>
          <Field label={t('marketing.ends')} optional error={e.ends_at}>{(a) => <input {...a} type="datetime-local" className="field-input" value={f.ends_at} onChange={(x) => set('ends_at', x.target.value)} />}</Field>
          <Field label={t('marketing.usageLimit')} optional>{(a) => <input {...a} type="number" min={1} className="field-input" value={f.usage_limit} onChange={(x) => set('usage_limit', x.target.value)} />}</Field>
          <Field label={t('marketing.perGuest')} optional>{(a) => <input {...a} type="number" min={1} className="field-input" value={f.per_customer_limit} onChange={(x) => set('per_customer_limit', x.target.value)} />}</Field>
        </div>
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <Toggle checked={f.online} onChange={(v) => set('online', v)} label={t('marketing.online')} />
          <Toggle checked={f.pos} onChange={(v) => set('pos', v)} label={t('marketing.pos')} />
          <Toggle checked={f.is_public} onChange={(v) => set('is_public', v)} label={t('marketing.public')} hint={t('marketing.publicHint')} />
          <Toggle checked={f.is_active} onChange={(v) => set('is_active', v)} label={t('marketing.active')} />
        </div>
        {e.form && <Alert>{e.form}</Alert>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button></div>
      </form>
    </Dialog>
  );
}

function CouponsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['coupons'], queryFn: async () => (await api.get<Coupon[]>('/tenant/marketing/coupons')).data });
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const remove = useMutation<{ message: string | null }, ApiError, number>({
    mutationFn: (id) => api.delete(`/tenant/marketing/coupons/${id}`),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['coupons'] }); toast.success(r.message ?? t('common.saved')); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" /> {t('marketing.newCoupon')}</button>
      {q.isLoading && <SkeletonRows rows={3} />}
      {q.data && !q.data.length && <EmptyState title={t('marketing.noCoupons')}>{t('marketing.noCouponsHint')}</EmptyState>}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {q.data?.map((c) => (
          <li key={c.id} className={`card p-4 ${c.is_active ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-lg font-extrabold">{c.code}</p>
                <p className="text-sm">{c.type === 'percent' ? t('marketing.offPercent', { value: Number(c.value) }) : t('marketing.offFlat', { value: formatMoney(c.value) })}{c.max_discount && ` · ${t('marketing.capped', { value: formatMoney(c.max_discount) })}`}{Number(c.min_order) > 0 && ` · ${t('marketing.min', { value: formatMoney(c.min_order) })}`}</p>
                <p className="mt-1 text-xs text-muted">{t('marketing.used', { count: c.used_count, limit: c.usage_limit ?? '∞' })} · {t('marketing.given', { value: formatMoney(c.discount_given ?? 0) })}{c.ends_at && ` · ${t('marketing.until', { date: fmtDate(c.ends_at) })}`}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.online && <Badge tone="confirmed">{t('marketing.onlineShort')}</Badge>}
                  {c.pos && <Badge tone="confirmed">POS</Badge>}
                  {c.is_public && <Badge tone="paid">{t('marketing.publicShort')}</Badge>}
                  {!c.is_active && <Badge tone="unpaid">{t('marketing.off')}</Badge>}
                </div>
              </div>
              <div className="flex gap-1">
                <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={() => setEditing(c)} aria-label={t('marketing.editCoupon', { code: c.code })}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                <button type="button" className="btn-ghost !min-h-9 !px-2 text-danger" onClick={() => remove.mutate(c.id)} aria-label={t('common.remove')}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <CouponDialog coupon={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

// ---------- Loyalty and gift cards ----------

function LoyaltyTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['loyalty'], queryFn: async () => (await api.get<{ settings: LoyaltySettings; members: number; outstanding_points: number }>('/tenant/loyalty')).data });
  const [f, setF] = useState<LoyaltySettings | null>(null);
  useEffect(() => { if (q.data) setF(q.data.settings); }, [q.data]);
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => api.put('/tenant/loyalty', f),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['loyalty'] }); toast.success(t('common.saved')); },
    onError: (e) => toast.error(e.message),
  });
  if (!f || !q.data) return <SkeletonRows rows={3} />;
  const n = (k: keyof LoyaltySettings) => (v: string) => setF({ ...f, [k]: Number(v) });
  const example = Math.floor(5 * f.earn_per_100);
  return (
    <form className="card max-w-3xl space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Toggle checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label={t('marketing.loyaltyOn')} hint={t('marketing.loyaltyOnHint')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('marketing.earnPer100')} hint={t('marketing.earnExample', { count: example })}>{(a) => <input {...a} type="number" min={0} step="0.5" className="field-input" value={f.earn_per_100} onChange={(e) => n('earn_per_100')(e.target.value)} />}</Field>
        <Field label={t('marketing.pointValue')} hint={t('marketing.pointValueHint', { value: formatMoney(f.point_value * 100) })}>{(a) => <input {...a} type="number" min={0.01} step="0.01" className="field-input" value={f.point_value} onChange={(e) => n('point_value')(e.target.value)} />}</Field>
        <Field label={t('marketing.minRedeem')}>{(a) => <input {...a} type="number" min={0} className="field-input" value={f.min_redeem} onChange={(e) => n('min_redeem')(e.target.value)} />}</Field>
        <Field label={t('marketing.maxRedeem')}>{(a) => <input {...a} type="number" min={1} max={100} className="field-input" value={f.max_redeem_percent} onChange={(e) => n('max_redeem_percent')(e.target.value)} />}</Field>
      </div>
      <p className="text-sm text-muted">{t('marketing.loyaltyStats', { members: q.data.members, points: q.data.outstanding_points.toLocaleString('en-IN'), value: formatMoney(q.data.outstanding_points * f.point_value) })}</p>
      <p className="text-sm text-muted">{t('marketing.loyaltyRules')}</p>
      <div className="flex justify-end"><button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button></div>
    </form>
  );
}

function GiftCardsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['gift-cards'], queryFn: async () => (await api.get<GiftCardRow[]>('/tenant/loyalty/gift-cards')).data });
  const [issuing, setIssuing] = useState(false);
  const [f, setF] = useState({ value: '500', mode: 'cash', issued_to: '', phone: '', expires_on: '' });
  const [made, setMade] = useState<GiftCardRow | null>(null);
  const [voiding, setVoiding] = useState<GiftCardRow | null>(null);
  const [reason, setReason] = useState('');
  const issue = useMutation<{ data: GiftCardRow }, ApiError>({
    mutationFn: () => api.post<GiftCardRow>('/tenant/loyalty/gift-cards', { ...f, value: Number(f.value), issued_to: f.issued_to || null, phone: f.phone || null, expires_on: f.expires_on || null }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['gift-cards'] }); setMade(r.data); setIssuing(false); },
    onError: (e) => toast.error(e.message),
  });
  const cancel = useMutation<unknown, ApiError>({
    mutationFn: () => api.post(`/tenant/loyalty/gift-cards/${voiding!.id}/void`, { reason }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['gift-cards'] }); setVoiding(null); setReason(''); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => setIssuing(true)}><Gift className="h-4 w-4" aria-hidden="true" /> {t('marketing.issueCard')}</button>
      {made && (
        <Alert tone="success">
          <p>{t('marketing.cardMade', { value: formatMoney(made.initial_value) })}</p>
          <p className="mt-1 flex items-center gap-2 font-mono text-xl font-extrabold tracking-wider">{made.code}<button type="button" className="btn-ghost !min-h-8 !px-2" onClick={() => void navigator.clipboard?.writeText(made.code)} aria-label={t('marketing.copyCode')}><Copy className="h-4 w-4" aria-hidden="true" /></button></p>
        </Alert>
      )}
      {q.data && !q.data.length && <EmptyState title={t('marketing.noCards')}>{t('marketing.noCardsHint')}</EmptyState>}
      <ul className="card divide-y divide-line">
        {q.data?.map((g) => (
          <li key={g.id} className={`flex flex-wrap items-center gap-3 p-3 ${g.status === 'void' ? 'opacity-50' : ''}`}>
            <span className="font-mono font-bold">{g.code}</span>
            <span className="text-sm text-muted">{g.issued_to}</span>
            {g.status === 'void' && <Badge tone="cancelled">{t('marketing.cancelled')}</Badge>}
            {g.expires_on && <span className="text-xs text-muted">{t('marketing.until', { date: fmtDate(g.expires_on) })}</span>}
            <span className="ml-auto tabular-nums"><strong>{formatMoney(g.balance)}</strong> <span className="text-muted">/ {formatMoney(g.initial_value)}</span></span>
            {g.status === 'active' && <button type="button" className="btn-ghost !min-h-9 text-xs text-danger" onClick={() => setVoiding(g)}>{t('marketing.cancelCard')}</button>}
          </li>
        ))}
      </ul>
      <Dialog open={issuing} onClose={() => setIssuing(false)} title={t('marketing.issueCard')}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); issue.mutate(); }}>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('marketing.cardValue')}>{(a) => <input {...a} type="number" min={1} max={100000} className="field-input" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} data-autofocus />}</Field>
            <Field label={t('marketing.paidBy')}>{(a) => <select {...a} className="field-input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>{['cash', 'upi', 'card', 'complimentary'].map((m) => <option key={m} value={m}>{t(`marketing.modes.${m}`)}</option>)}</select>}</Field>
            <Field label={t('marketing.forName')} optional>{(a) => <input {...a} className="field-input" value={f.issued_to} onChange={(e) => setF({ ...f, issued_to: e.target.value })} />}</Field>
            <Field label={t('order.phone')} optional>{(a) => <input {...a} type="tel" className="field-input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
            <Field label={t('marketing.expires')} optional>{(a) => <input {...a} type="date" className="field-input" value={f.expires_on} onChange={(e) => setF({ ...f, expires_on: e.target.value })} />}</Field>
          </div>
          <div className="flex justify-end"><button type="submit" className="btn-primary" disabled={issue.isPending}>{issue.isPending ? <Spinner /> : t('marketing.issue')}</button></div>
        </form>
      </Dialog>
      <Dialog open={!!voiding} onClose={() => setVoiding(null)} title={t('marketing.cancelCard')}>
        <p className="mb-3 text-sm">{t('marketing.cancelCardText', { balance: formatMoney(voiding?.balance ?? 0) })}</p>
        <input className="field-input" placeholder={t('pos.voidReason')} aria-label={t('pos.voidReason')} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="mt-4 flex justify-end"><button type="button" className="btn-primary" disabled={reason.trim().length < 3 || cancel.isPending} onClick={() => cancel.mutate()}>{t('marketing.cancelCard')}</button></div>
      </Dialog>
    </div>
  );
}

// ---------- Banners ----------

function BannersTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['banners'], queryFn: async () => (await api.get<Banner[]>('/tenant/marketing/banners')).data });
  const blank = { placement: 'bar' as Banner['placement'], title: '', title_hi: '', text: '', text_hi: '', cta_label: '', cta_link: '', coupon_code: '', starts_at: '', ends_at: '', is_active: true };
  const [editing, setEditing] = useState<Banner | 'new' | null>(null);
  const [f, setF] = useState(blank);
  const [e, setE] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!editing) return;
    setE({});
    setF(editing === 'new' ? blank : { placement: editing.placement, title: editing.title, title_hi: editing.title_hi ?? '', text: editing.text ?? '', text_hi: editing.text_hi ?? '', cta_label: editing.cta_label ?? '', cta_link: editing.cta_link ?? '', coupon_code: editing.coupon_code ?? '', starts_at: toLocal(editing.starts_at), ends_at: toLocal(editing.ends_at), is_active: editing.is_active });
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation<unknown, ApiError>({
    mutationFn: () => {
      const body = { ...f, title_hi: f.title_hi || null, text: f.text || null, text_hi: f.text_hi || null, cta_label: f.cta_label || null, cta_link: f.cta_link || null, coupon_code: f.coupon_code || null, starts_at: fromLocal(f.starts_at), ends_at: fromLocal(f.ends_at) };
      return editing === 'new' ? api.post('/tenant/marketing/banners', body) : api.put(`/tenant/marketing/banners/${(editing as Banner).id}`, body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['banners'] }); toast.success(t('common.saved')); setEditing(null); },
    onError: (x) => setE(errs(x)),
  });
  const remove = useMutation<unknown, ApiError, number>({ mutationFn: (id) => api.delete(`/tenant/marketing/banners/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: ['banners'] }) });
  return (
    <div className="space-y-4">
      <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" /> {t('marketing.newBanner')}</button>
      {q.data && !q.data.length && <EmptyState title={t('marketing.noBanners')}>{t('marketing.noBannersHint')}</EmptyState>}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {q.data?.map((b) => (
          <li key={b.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap gap-1.5"><Badge tone="confirmed">{t(`marketing.placements.${b.placement}`)}</Badge>{b.live ? <Badge tone="live">{t('marketing.live')}</Badge> : <Badge tone="unpaid">{t('marketing.notLive')}</Badge>}</div>
                <p className="mt-2 font-bold">{b.title}</p>
                {b.text && <p className="text-sm text-muted">{b.text}</p>}
                <p className="mt-1 text-xs text-muted">{[b.coupon_code, b.starts_at && fmtDate(b.starts_at), b.ends_at && `→ ${fmtDate(b.ends_at)}`].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex gap-1">
                <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={() => setEditing(b)} aria-label={t('common.edit')}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                <button type="button" className="btn-ghost !min-h-9 !px-2 text-danger" onClick={() => remove.mutate(b.id)} aria-label={t('common.remove')}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? t('marketing.newBanner') : t('marketing.editBanner')} wide>
        <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); save.mutate(); }} noValidate>
          <fieldset><legend className="field-label">{t('marketing.placement')}</legend>
            <div className="flex flex-wrap gap-2">{(['bar', 'popup', 'offer'] as const).map((p) => <button key={p} type="button" aria-pressed={f.placement === p} onClick={() => setF({ ...f, placement: p })} className={`rounded-full border px-4 py-2 text-sm font-semibold ${f.placement === p ? 'border-ink bg-ink text-paper' : 'border-line'}`}>{t(`marketing.placements.${p}`)}</button>)}</div>
            <p className="mt-1 text-sm text-muted">{t(`marketing.placementHint.${f.placement}`)}</p>
          </fieldset>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('marketing.bannerTitle')} error={e.title}>{(a) => <input {...a} className="field-input" maxLength={120} value={f.title} onChange={(x) => setF({ ...f, title: x.target.value })} />}</Field>
            <Field label={`${t('marketing.bannerTitle')} (हिन्दी)`} optional>{(a) => <input {...a} className="field-input" maxLength={120} value={f.title_hi} onChange={(x) => setF({ ...f, title_hi: x.target.value })} />}</Field>
            <Field label={t('marketing.bannerText')} optional>{(a) => <textarea {...a} rows={2} className="field-input" maxLength={300} value={f.text} onChange={(x) => setF({ ...f, text: x.target.value })} />}</Field>
            <Field label={`${t('marketing.bannerText')} (हिन्दी)`} optional>{(a) => <textarea {...a} rows={2} className="field-input" maxLength={300} value={f.text_hi} onChange={(x) => setF({ ...f, text_hi: x.target.value })} />}</Field>
            <Field label={t('marketing.ctaLink')} optional>{(a) => <select {...a} className="field-input" value={f.cta_link} onChange={(x) => setF({ ...f, cta_link: x.target.value })}><option value="">—</option>{['/menu', '/reserve', '/offers', '/contact'].map((l) => <option key={l} value={l}>{t(`marketing.links.${l.slice(1)}`)}</option>)}</select>}</Field>
            <Field label={t('marketing.ctaLabel')} optional>{(a) => <input {...a} className="field-input" maxLength={40} value={f.cta_label} onChange={(x) => setF({ ...f, cta_label: x.target.value })} />}</Field>
            <Field label={t('marketing.showCode')} optional>{(a) => <input {...a} className="field-input font-mono uppercase" maxLength={30} value={f.coupon_code} onChange={(x) => setF({ ...f, coupon_code: x.target.value })} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('marketing.starts')} optional>{(a) => <input {...a} type="datetime-local" className="field-input" value={f.starts_at} onChange={(x) => setF({ ...f, starts_at: x.target.value })} />}</Field>
              <Field label={t('marketing.ends')} optional error={e.ends_at}>{(a) => <input {...a} type="datetime-local" className="field-input" value={f.ends_at} onChange={(x) => setF({ ...f, ends_at: x.target.value })} />}</Field>
            </div>
          </div>
          <Toggle checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label={t('marketing.active')} />
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</button><button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button></div>
        </form>
      </Dialog>
    </div>
  );
}

// ---------- Campaigns ----------

function CampaignsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['campaigns'], queryFn: async () => (await api.get<{ id: number; name: string; channel: string; message: string; recipients: number; sent_at: string }[]>('/tenant/marketing/campaigns')).data });
  const [f, setF] = useState({ name: '', channel: 'whatsapp', message: '', tags: '', min_visits: '', inactive_days: '', birthday_month: '' });
  const audience = { tags: f.tags.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean), min_visits: f.min_visits ? Number(f.min_visits) : null, inactive_days: f.inactive_days ? Number(f.inactive_days) : null, birthday_month: f.birthday_month ? Number(f.birthday_month) : null };
  const count = useQuery({ queryKey: ['campaign-audience', f.channel, JSON.stringify(audience)], queryFn: async () => (await api.post<{ recipients: number }>('/tenant/marketing/campaigns/audience', { channel: f.channel, audience })).data.recipients });
  const [confirm, setConfirm] = useState(false);
  const send = useMutation<{ message: string | null }, ApiError>({
    mutationFn: () => api.post('/tenant/marketing/campaigns', { ...f, audience }),
    onSuccess: (r) => { toast.success(r.message ?? t('common.saved')); setConfirm(false); setF({ ...f, name: '', message: '' }); void qc.invalidateQueries({ queryKey: ['campaigns'] }); },
    onError: (e) => { toast.error(e.message); setConfirm(false); },
  });
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
      <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); setConfirm(true); }}>
        <Alert tone="info">{t('marketing.campaignRules')}</Alert>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('marketing.campaignName')}>{(a) => <input {...a} className="field-input" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />}</Field>
          <Field label={t('marketing.channel')}>{(a) => <select {...a} className="field-input" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>{['whatsapp', 'sms', 'email'].map((c) => <option key={c} value={c}>{t(`marketing.channels.${c}`)}</option>)}</select>}</Field>
        </div>
        <Field label={t('marketing.message')} hint={t('marketing.messageHint', { count: f.message.length })}>{(a) => <textarea {...a} rows={4} maxLength={600} className="field-input" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} required />}</Field>
        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <legend className="field-label sm:col-span-4">{t('marketing.audience')}</legend>
          <Field label={t('marketing.tags')} optional>{(a) => <input {...a} className="field-input" placeholder="vip, regular" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />}</Field>
          <Field label={t('marketing.minVisits')} optional>{(a) => <input {...a} type="number" min={0} className="field-input" value={f.min_visits} onChange={(e) => setF({ ...f, min_visits: e.target.value })} />}</Field>
          <Field label={t('marketing.inactiveDays')} optional>{(a) => <input {...a} type="number" min={1} className="field-input" value={f.inactive_days} onChange={(e) => setF({ ...f, inactive_days: e.target.value })} />}</Field>
          <Field label={t('marketing.birthdayMonth')} optional>{(a) => <select {...a} className="field-input" value={f.birthday_month} onChange={(e) => setF({ ...f, birthday_month: e.target.value })}><option value="">—</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Intl.DateTimeFormat('en-IN', { month: 'long' }).format(new Date(2026, i, 1))}</option>)}</select>}</Field>
        </fieldset>
        <p className="font-semibold" aria-live="polite">{t('marketing.reach', { count: count.data ?? 0 })}</p>
        <button type="submit" className="btn-primary" disabled={!f.name || f.message.length < 5 || !count.data}><Send className="h-4 w-4" aria-hidden="true" /> {t('marketing.send')}</button>
      </form>
      <section className="card p-5">
        <h2 className="font-bold">{t('marketing.sent')}</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {(list.data ?? []).length === 0 && <li className="text-muted">{t('marketing.noneSent')}</li>}
          {list.data?.map((c) => <li key={c.id}><p className="font-semibold">{c.name}</p><p className="text-muted">{t(`marketing.channels.${c.channel}`)} · {t('marketing.reach', { count: c.recipients })} · {fmtDate(c.sent_at)}</p></li>)}
        </ul>
      </section>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('marketing.confirmSend')}>
        <p>{t('marketing.confirmText', { count: count.data ?? 0, channel: t(`marketing.channels.${f.channel}`) })}</p>
        <p className="mt-3 rounded-xl bg-ink/5 p-3 text-sm">{f.message}</p>
        <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setConfirm(false)}>{t('common.cancel')}</button><button type="button" className="btn-primary" disabled={send.isPending} onClick={() => send.mutate()}>{send.isPending ? <Spinner /> : t('marketing.sendNow')}</button></div>
      </Dialog>
    </div>
  );
}

export default function MarketingPage() {
  const { t } = useTranslation();
  const hasCoupons = useFeature('coupons');
  const hasLoyalty = useFeature('loyalty');
  const tabs = [...(hasCoupons ? ['coupons'] : []), ...(hasLoyalty ? ['loyalty', 'cards'] : []), ...(hasCoupons ? ['banners', 'campaigns', 'automations'] : [])] as const;
  const [tab, setTab] = useTabParam<string>(tabs, tabs[0] ?? 'coupons');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight"><Megaphone className="h-7 w-7" aria-hidden="true" /> {t('marketing.title')}</h1>
          <p className="text-muted">{t('marketing.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-full bg-ink/5 p-1" role="tablist">
          {tabs.map((k) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-surface shadow' : 'text-muted'}`}>{t(`marketing.tab.${k}`)}</button>)}
        </div>
      </div>
      {!tabs.length && <Alert tone="info">{t('marketing.noPlan')}</Alert>}
      {tab === 'coupons' && hasCoupons && <CouponsTab />}
      {tab === 'loyalty' && hasLoyalty && <LoyaltyTab />}
      {tab === 'cards' && hasLoyalty && <GiftCardsTab />}
      {tab === 'banners' && hasCoupons && <BannersTab />}
      {tab === 'campaigns' && hasCoupons && <CampaignsTab />}
      {tab === 'automations' && hasCoupons && <AutomationsTab />}
    </div>
  );
}
