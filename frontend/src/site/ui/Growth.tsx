import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Loader2, Star, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useLocalized } from '../data';
import { useMoney } from '../ordering';
import { PREVIEW } from '../preview';
import type { SiteBanner, SiteData } from '../types';
import { PageHeader } from './pages';

const seenKey = (id: number) => `dd_banner_${id}`;
function seen(id: number) {
  try {
    return sessionStorage.getItem(seenKey(id)) === '1';
  } catch {
    return false;
  }
}
function markSeen(id: number) {
  try {
    sessionStorage.setItem(seenKey(id), '1');
  } catch {
    /* ignore */
  }
}

function useBannerText() {
  const l = useLocalized();
  return (b: SiteBanner) => ({ title: l(b, 'title') ?? b.title, text: l(b, 'text') });
}

function CopyCode({ code }: { code: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--t-radius-btn)] border border-dashed border-current px-3 font-mono text-sm font-bold tracking-wider"
      onClick={() => {
        void navigator.clipboard?.writeText(code);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      aria-label={t('site.offers.copy', { code })}
    >
      {code}
      {done ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

/** Thin offer bar above the header (dismissed for this visit). */
export function BannerBar({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const text = useBannerText();
  const bar = site.growth?.banners.find((b) => b.placement === 'bar');
  const [hidden, setHidden] = useState(() => !bar || seen(bar.id));
  if (!bar || hidden) return null;
  const { title, text: body } = text(bar);
  return (
    <div className="relative bg-t-primary px-10 py-2 text-center text-sm text-t-on-primary" role="region" aria-label={t('site.offers.barLabel')}>
      <span className="font-bold">{title}</span>
      {body && <span className="hidden sm:inline"> · {body}</span>}
      {bar.coupon_code && (
        <span className="ml-2">
          {t('site.offers.useCode')} <strong className="font-mono">{bar.coupon_code}</strong>
        </span>
      )}
      {bar.cta_link && (
        <Link to={bar.cta_link} className="ml-2 font-bold underline underline-offset-2">
          {bar.cta_label || t('site.offers.see')}
        </Link>
      )}
      <button type="button" onClick={() => { markSeen(bar.id); setHidden(true); }} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center" aria-label={t('common.close')}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Festive popup: once per visit, a few seconds in, never over checkout or the table page. */
export function OfferPopup({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const text = useBannerText();
  const { pathname } = useLocation();
  const popup = site.growth?.banners.find((b) => b.placement === 'popup');
  const [open, setOpen] = useState(false);
  const quiet = pathname.startsWith('/checkout') || pathname.startsWith('/order/') || pathname.startsWith('/t') || pathname === '/table' || PREVIEW;
  useEffect(() => {
    if (!popup || quiet || seen(popup.id)) return;
    const id = setTimeout(() => setOpen(true), 4000);
    return () => clearTimeout(id);
  }, [popup, quiet]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!popup || !open) return null;
  const close = () => {
    markSeen(popup.id);
    setOpen(false);
  };
  const { title, text: body } = text(popup);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={close}>
      <div role="dialog" aria-modal="true" aria-labelledby="offer-pop-title" className="s-card relative w-full max-w-md p-6 text-center" style={{ animation: 's-fade .5s var(--t-ease)' }} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={close} className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center" aria-label={t('common.close')} autoFocus>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="s-eyebrow">{t('site.offers.eyebrow')}</p>
        <h2 id="offer-pop-title" className="s-h2 mt-2">
          {title}
        </h2>
        {body && <p className="s-muted mt-3">{body}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {popup.coupon_code && <CopyCode code={popup.coupon_code} />}
          {popup.cta_link && (
            <Link to={popup.cta_link} className="s-btn s-btn-primary" onClick={close}>
              {popup.cta_label || t('site.offers.see')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

interface PublicCoupon {
  code: string;
  description: string | null;
  type: 'flat' | 'percent';
  value: string;
  max_discount: string | null;
  min_order: string;
  ends_at: string | null;
}

/** /offers: festive offers and the coupons the business shows publicly. */
export function OffersPage({ site }: { site: SiteData }) {
  const { t, i18n } = useTranslation();
  const money = useMoney();
  const text = useBannerText();
  const coupons = useQuery({ queryKey: ['site', 'offers'], queryFn: async () => (await api.get<PublicCoupon[]>('/site/offers')).data });
  const cards = site.growth?.banners.filter((b) => b.placement === 'offer') ?? [];
  const date = (iso: string) => new Intl.DateTimeFormat(i18n.language.startsWith('hi') ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', timeZone: site.timezone }).format(new Date(iso));
  const list = coupons.data ?? [];
  return (
    <>
      <PageHeader site={site} banner eyebrow={site.name} title={t('site.offers.title')} lead={t('site.offers.lead')} />
      <div className="s-wrap grid gap-5 pb-20 md:grid-cols-2">
        {cards.map((b, i) => (
          <article key={b.id} className="s-reveal s-card p-6" style={{ ['--i' as string]: i % 3 }}>
            <h2 className="s-h3">{text(b).title}</h2>
            {text(b).text && <p className="s-muted mt-2">{text(b).text}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {b.coupon_code && <CopyCode code={b.coupon_code} />}
              {b.cta_link && (
                <Link to={b.cta_link} className="s-btn s-btn-secondary s-btn-sm">
                  {b.cta_label || t('site.offers.see')}
                </Link>
              )}
            </div>
            {b.ends_at && <p className="s-small s-muted mt-3">{t('site.offers.until', { date: date(b.ends_at) })}</p>}
          </article>
        ))}
        {list.map((c, i) => (
          <article key={c.code} className="s-reveal s-card p-6" style={{ ['--i' as string]: (i + cards.length) % 3 }}>
            <p className="s-h2">{c.type === 'percent' ? t('site.offers.percentOff', { value: Number(c.value) }) : t('site.offers.flatOff', { value: money(c.value) })}</p>
            {c.description && <p className="mt-2">{c.description}</p>}
            <p className="s-small s-muted mt-2">
              {[
                Number(c.min_order) > 0 && t('site.offers.minOrder', { value: money(c.min_order) }),
                c.max_discount && t('site.offers.upTo', { value: money(c.max_discount) }),
                c.ends_at && t('site.offers.until', { date: date(c.ends_at) }),
              ].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <CopyCode code={c.code} />
              {site.ordering.enabled && (
                <Link to="/menu" className="s-btn s-btn-primary s-btn-sm">
                  {t('site.hero.order')}
                </Link>
              )}
            </div>
          </article>
        ))}
        {!coupons.isLoading && cards.length === 0 && list.length === 0 && <p className="s-muted md:col-span-2">{t('site.offers.none')}</p>}
      </div>
    </>
  );
}

function Stars({ value, className = '' }: { value: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex ${className}`} role="img" aria-label={t('site.reviews.stars', { count: value })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-4 w-4 ${n <= value ? 'fill-current text-t-link' : 'text-t-line'}`} aria-hidden="true" />
      ))}
    </span>
  );
}

/** Real reviews only: guests' own feedback they agreed to share and the owner published. */
export function Reviews({ site }: { site: SiteData }) {
  const { t, i18n } = useTranslation();
  const r = site.growth?.reviews;
  if (!r || r.count === 0) return null;
  return (
    <section className="s-section s-ruled" aria-labelledby="reviews-title">
      <div className="s-wrap">
        <div className="s-reveal flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="s-eyebrow">{t('site.reviews.eyebrow')}</p>
            <h2 id="reviews-title" className="s-h2 mt-3">
              {t('site.reviews.title')}
            </h2>
          </div>
          {r.average !== null && (
            <p className="flex items-center gap-2">
              <span className="text-3xl font-bold tabular-nums">{r.average.toFixed(1)}</span>
              <Stars value={Math.round(r.average)} />
              <span className="s-small s-muted">{t('site.reviews.count', { count: r.count })}</span>
            </p>
          )}
        </div>
        <ul className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {r.items.map((it, i) => (
            <li key={i} className="s-reveal s-card p-6" style={{ ['--i' as string]: i % 3 }}>
              <Stars value={it.rating} />
              {it.comment && <p className="s-body mt-3">“{it.comment}”</p>}
              <p className="s-small s-muted mt-4">
                {it.name ?? t('site.reviews.guest')} · {new Intl.DateTimeFormat(i18n.language.startsWith('hi') ? 'hi-IN' : 'en-IN', { month: 'long', year: 'numeric' }).format(new Date(`${it.date}T12:00:00Z`))}
              </p>
              {it.reply && (
                <p className="s-small mt-3 border-l-2 border-t-line pl-3">
                  <span className="font-semibold">{site.name}: </span>
                  {it.reply}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** After a completed order: a short rating, optionally shared on the website. */
export function FeedbackForm({ orderId, token, site }: { orderId: string; token: string; site: SiteData }) {
  const { t } = useTranslation();
  const status = useQuery({ queryKey: ['site', 'feedback', orderId], queryFn: async () => (await api.get<{ can_rate: boolean; rating: number | null }>(`/site/orders/${orderId}/feedback`, { t: token })).data });
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  if (!status.data) return null;
  if (done || status.data.rating) {
    // The same invitation for every guest, whatever they rated (Google doesn't allow asking only happy guests).
    const review = site.content.socials.google_review;
    return (
      <div className="s-card space-y-3 p-5" role="status">
        <p className="font-semibold">{t('site.feedback.thanks')}</p>
        {review && (
          <>
            <p className="s-small s-muted">{t('site.feedback.googleAsk', { name: site.name })}</p>
            <a href={review} target="_blank" rel="noopener noreferrer" className="s-btn s-btn-secondary">
              <Star className="h-4 w-4" aria-hidden="true" /> {t('site.feedback.google')}
              <span className="sr-only"> ({t('common.opensInNewTab')})</span>
            </a>
          </>
        )}
      </div>
    );
  }
  if (!status.data.can_rate) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return setError(t('site.feedback.pick'));
    setBusy(true);
    setError('');
    try {
      await api.post(`/site/orders/${orderId}/feedback`, { t: token, rating, comment: comment || null, consent_public: consent });
      setDone(true);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="s-card space-y-4 p-5" onSubmit={submit} aria-labelledby="fb-title">
      <h2 id="fb-title" className="s-h3">
        {t('site.feedback.title', { name: site.name })}
      </h2>
      <div role="radiogroup" aria-label={t('site.feedback.rating')} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t('site.reviews.stars', { count: n })} onClick={() => setRating(n)} className="flex h-11 w-11 items-center justify-center">
            <Star className={`h-7 w-7 ${n <= rating ? 'fill-current text-t-link' : 'text-t-muted'}`} aria-hidden="true" />
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-sm font-bold">{t('site.feedback.comment')}</span> <span className="s-small s-muted">({t('order.optional')})</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={600} rows={3} className="s-input mt-1.5 py-2.5" />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--t-primary)]" />
        <span>{t('site.feedback.consent')}</span>
      </label>
      {error && <p role="alert" className="text-sm font-semibold text-[var(--s-error)]">{error}</p>}
      <button type="submit" disabled={busy} className="s-btn s-btn-primary">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {t('site.feedback.send')}
      </button>
    </form>
  );
}

/** /unsubscribe?t=…: one tap to stop offer messages. */
export function UnsubscribePage({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const token = params.get('t') ?? '';
  const go = async () => {
    setState('busy');
    try {
      await api.post('/site/unsubscribe', { t: token });
      setState('done');
    } catch {
      setState('error');
    }
  };
  return (
    <>
      <PageHeader site={site} eyebrow={site.name} title={t('site.unsub.title')} lead={state === 'done' ? t('site.unsub.done') : state === 'error' ? t('site.unsub.error') : t('site.unsub.lead', { name: site.name })} />
      {state !== 'done' && state !== 'error' && (
        <div className="s-wrap pb-20">
          <button type="button" className="s-btn s-btn-primary" disabled={!token || state === 'busy'} onClick={() => void go()}>
            {state === 'busy' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t('site.unsub.confirm')}
          </button>
        </div>
      )}
    </>
  );
}
