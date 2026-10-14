import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BedDouble, CalendarCheck, CheckCircle2, Loader2, LogOut, Maximize2, Minus, PartyPopper, Plus, ShoppingBag, UtensilsCrossed, Users } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { isIndianMobile } from '@/lib/format';
import { telHref, useLocalized } from '../data';
import { apiLines, cartCount, cartEstimate, useCart } from '../cart';
import { loadRazorpay, rememberOrder, useMoney, useQuote } from '../ordering';
import { BillSummary } from '../order/Cart';
import { rememberStay, rememberedStays, useActiveRoom, useGuestStay, useHotel, useRoom, useStayAvailability, ymdAdd, ymdLabel, ymdToday, type GuestStay, type RoomTypeInfo, type StayQuote } from '../hotel';
import type { CustomerOrder, SiteData } from '../types';
import { PageHeader } from './pages';

const CONTACT_KEY = 'dd_checkout_contact';
function savedContact(): { name: string; phone: string; email: string } {
  try {
    const c = JSON.parse(localStorage.getItem(CONTACT_KEY) ?? '{}');
    return { name: c.name ?? '', phone: c.phone ?? '', email: c.email ?? '' };
  } catch {
    return { name: '', phone: '', email: '' };
  }
}

function ErrorText({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return <span id={id} role="alert" className="mt-1.5 block text-sm font-semibold text-[var(--s-error)]">{children}</span>;
}

function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'ok' }) {
  return <p role={tone === 'error' ? 'alert' : 'status'} className={`s-small rounded-[var(--t-radius-input)] px-3 py-2 font-semibold ${tone === 'error' ? 'bg-[#fee2e2] text-[#991b1b]' : 'bg-[#dcfce7] text-[#14532d]'}`}>{children}</p>;
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const { t } = useTranslation();
  return (
    <div>
      <span className="text-sm font-bold">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" className="s-chip !min-h-11 !w-11 justify-center !px-0" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={t('site.stay.fewer', { what: label })}><Minus className="h-4 w-4" aria-hidden="true" /></button>
        <span className="w-8 text-center text-lg font-bold tabular-nums" aria-live="polite">{value}</span>
        <button type="button" className="s-chip !min-h-11 !w-11 justify-center !px-0" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={t('site.stay.more', { what: label })}><Plus className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </div>
  );
}

/** Pay an advance in Razorpay Checkout; resolves true once paid (verified by the server or the webhook). */
async function payAdvance(stayId: string, token: string, rzp: Record<string, unknown>): Promise<boolean> {
  await loadRazorpay();
  return new Promise<boolean>((resolve) => {
    const checkout = new window.Razorpay!({
      key: rzp.key_id,
      order_id: rzp.order_id,
      amount: rzp.amount,
      currency: rzp.currency,
      name: rzp.name,
      description: rzp.description,
      prefill: rzp.prefill,
      theme: { color: getComputedStyle(document.querySelector('.site-root')!).getPropertyValue('--t-primary').trim() },
      handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        try {
          await api.post(`/site/hotel/bookings/${stayId}/verify-payment`, { t: token, ...r });
        } catch {
          /* the webhook still confirms it; the booking page shows the current state */
        }
        resolve(true);
      },
      modal: { ondismiss: () => resolve(false) },
    });
    checkout.on('payment.failed', () => undefined);
    checkout.open();
  });
}

function Amenities({ items }: { items: string[] }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t('site.stay.amenities')}>
      {items.map((a) => <li key={a} className="s-small rounded-full bg-t-surface-2 px-2.5 py-1">{t(`hotel.amenity.${a}`)}</li>)}
    </ul>
  );
}

function Photos({ type }: { type: RoomTypeInfo }) {
  const l = useLocalized();
  if (!type.photos.length) return <div className="flex aspect-[4/3] items-center justify-center rounded-[var(--t-radius-card)] bg-t-surface-2"><BedDouble className="h-10 w-10 opacity-30" aria-hidden="true" /></div>;
  return (
    <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-[var(--t-radius-card)]" tabIndex={0} aria-label={l(type, 'name') ?? type.name}>
      {type.photos.map((p, i) => (
        <img key={p.key} src={p.src} srcSet={p.srcset} sizes="(min-width: 1024px) 480px, 90vw" width={p.width} height={p.height} alt={p.alt} loading={i ? 'lazy' : 'eager'}
          className="aspect-[4/3] w-full shrink-0 snap-center object-cover" style={{ backgroundImage: p.placeholder ? `url(${p.placeholder})` : undefined, backgroundSize: 'cover' }} />
      ))}
    </div>
  );
}

function PriceLines({ quote }: { quote: StayQuote }) {
  const { t, i18n } = useTranslation();
  const money = useMoney();
  return (
    <div className="s-small space-y-1">
      {quote.rates.map((r) => (
        <p key={r.date} className="flex justify-between gap-3">
          <span>{ymdLabel(r.date, i18n.language)}{r.season ? ` · ${r.season}` : r.weekend ? ` · ${t('site.stay.weekend')}` : ''}</span>
          <span className="tabular-nums">{money(r.price)}</span>
        </p>
      ))}
      <p className="flex justify-between gap-3"><span>{t('site.stay.gst')}</span><span className="tabular-nums">{money(quote.tax_total)}</span></p>
      <p className="flex justify-between gap-3 border-t border-current/10 pt-1 text-base font-bold"><span>{t('site.stay.total')}</span><span className="tabular-nums">{money(quote.total)}</span></p>
    </div>
  );
}

/** /rooms: room types with photos, and the booking engine (dates, guests, live price). */
export function RoomsPage({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const money = useMoney();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const hotel = useHotel();
  const today = ymdToday(site.timezone);
  const [form, setForm] = useState(() => {
    const ci = params.get('in') && params.get('in')! >= today ? params.get('in')! : today;
    const co = params.get('out') && params.get('out')! > ci ? params.get('out')! : ymdAdd(ci, 1);
    return { check_in: ci, check_out: co, adults: Number(params.get('adults')) || 2, children: Number(params.get('children')) || 0 };
  });
  const [search, setSearch] = useState<typeof form | null>(params.get('in') ? form : null);
  const avail = useStayAvailability(search);
  const [booking, setBooking] = useState<RoomTypeInfo | null>(null);

  if (!site.hotel?.has_rooms) return <Navigate to="/" replace />;
  const h = hotel.data;
  const nights = Math.max(1, Math.round((Date.parse(form.check_out) - Date.parse(form.check_in)) / 86400000));
  const maxIn = h ? ymdAdd(today, h.max_days_ahead) : undefined;
  const find = (e: FormEvent) => {
    e.preventDefault();
    setBooking(null);
    setSearch({ ...form });
    navigate(`/rooms?in=${form.check_in}&out=${form.check_out}&adults=${form.adults}&children=${form.children}`, { replace: true });
  };
  const result = (id: number) => avail.data?.types.find((x) => x.id === id);

  return (
    <>
      <PageHeader site={site} banner image={h?.types.find((x) => x.photos[0])?.photos[0] ?? null} eyebrow={site.name} title={t('site.stay.title')} lead={t('site.stay.lead', { in: site.hotel.check_in_time, out: site.hotel.check_out_time })} />
      <div className="s-wrap space-y-10 pb-24">
        {h?.online_booking ? (
          <form className="s-card grid grid-cols-2 items-end gap-4 p-5 sm:p-6 md:grid-cols-5" onSubmit={find}>
            <label className="block">
              <span className="text-sm font-bold">{t('site.stay.checkIn')}</span>
              <input type="date" className="s-input mt-1.5" min={today} max={maxIn} value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value, check_out: e.target.value >= form.check_out ? ymdAdd(e.target.value, 1) : form.check_out })} required />
            </label>
            <label className="block">
              <span className="text-sm font-bold">{t('site.stay.checkOut')}</span>
              <input type="date" className="s-input mt-1.5" min={ymdAdd(form.check_in, 1)} max={h ? ymdAdd(form.check_in, h.max_nights) : undefined} value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} required />
            </label>
            <Stepper label={t('site.stay.adults')} value={form.adults} min={1} max={10} onChange={(v) => setForm({ ...form, adults: v })} />
            <Stepper label={t('site.stay.children')} value={form.children} min={0} max={10} onChange={(v) => setForm({ ...form, children: v })} />
            <button type="submit" className="s-btn s-btn-primary col-span-2 md:col-span-1">
              {avail.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarCheck className="h-4 w-4" aria-hidden="true" />}
              {t('site.stay.check', { count: nights })}
            </button>
          </form>
        ) : (
          h && <div className="s-card flex flex-wrap items-center justify-between gap-3 p-5"><p className="font-semibold">{t('site.stay.callToBook')}</p>{site.content.contact.phone && <a className="s-btn s-btn-primary" href={telHref(site.content.contact.phone)}>{t('site.call')}</a>}</div>
        )}
        {avail.isError && <Notice>{(avail.error as Error).message}</Notice>}

        {hotel.isLoading && <div className="s-card h-64 animate-pulse" />}
        <ul className="grid gap-8 md:grid-cols-2" aria-live="polite">
          {h?.types.map((ty) => {
            const r = result(ty.id);
            return (
              <li key={ty.id} className="s-card flex flex-col overflow-hidden">
                <Photos type={ty} />
                <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="s-h3">{l(ty, 'name')}</h2>
                    <p className="text-right"><span className="s-small s-muted">{t('site.stay.from')}</span> <span className="text-lg font-bold">{money(ty.from_price)}</span><span className="s-small s-muted"> / {t('site.stay.night')}</span></p>
                  </div>
                  <p className="s-small s-muted flex flex-wrap gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" aria-hidden="true" />{t('site.stay.sleeps', { adults: ty.max_adults, children: ty.max_children })}</span>
                    {ty.bed && <span className="inline-flex items-center gap-1"><BedDouble className="h-4 w-4" aria-hidden="true" />{ty.bed}</span>}
                    {ty.size_sqft && <span className="inline-flex items-center gap-1"><Maximize2 className="h-4 w-4" aria-hidden="true" />{t('site.stay.sqft', { size: ty.size_sqft })}</span>}
                  </p>
                  {l(ty, 'description') && <p className="whitespace-pre-line">{l(ty, 'description')}</p>}
                  <Amenities items={ty.amenities} />
                  {Number(ty.extra_adult_price) > 0 && <p className="s-small s-muted">{t('site.stay.extraAdult', { count: ty.base_occupancy, price: money(ty.extra_adult_price) })}</p>}
                  <div className="mt-auto space-y-3 pt-2">
                    {r && !r.fits && <p className="font-semibold">{t('site.stay.tooMany')}</p>}
                    {r && r.fits && !r.available && <p className="font-semibold">{t('site.stay.full')}</p>}
                    {r?.quote && (
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <p>
                          <span className="block text-2xl font-bold">{money(r.quote.total)}</span>
                          <span className="s-small s-muted">{t('site.stay.forNights', { count: r.quote.nights })} · {h.charge_gst ? t('site.stay.inclGst') : t('site.stay.noGst')}</span>
                          {r.few_left && <span className="s-small block font-semibold text-[var(--s-error)]">{t('site.stay.fewLeft', { count: r.few_left })}</span>}
                        </p>
                        {h.online_booking && <button type="button" className="s-btn s-btn-primary" onClick={() => setBooking(ty)}>{t('site.stay.bookThis')}</button>}
                      </div>
                    )}
                    {!search && h.online_booking && <button type="button" className="s-btn s-btn-secondary" onClick={() => document.querySelector<HTMLInputElement>('input[type=date]')?.focus()}>{t('site.stay.pickDates')}</button>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {booking && search && result(booking.id)?.quote && <BookingForm type={booking} search={search} quote={result(booking.id)!.quote!} advancePct={h!.advance_percent} onClose={() => setBooking(null)} />}

        {h && (
          <section className="s-card space-y-2 p-5 sm:p-6" aria-labelledby="policies-h">
            <h2 id="policies-h" className="s-h3">{t('site.stay.policies')}</h2>
            <p>{t('site.stay.times', { in: h.check_in_time, out: h.check_out_time })}</p>
            {h.online_booking && <p>{h.free_cancel_days ? t('site.stay.cancelDays', { count: h.free_cancel_days }) : t('site.stay.cancelDayBefore')}</p>}
            {h.online_booking && h.advance_percent > 0 && <p>{t('site.stay.advanceNote', { percent: h.advance_percent })}</p>}
            {l(h, 'house_rules') && <p className="whitespace-pre-line">{l(h, 'house_rules')}</p>}
            <p className="s-small s-muted"><Link to="/stay" className="underline">{t('site.stay.findBooking')}</Link></p>
          </section>
        )}
      </div>
    </>
  );
}

function BookingForm({ type, search, quote, advancePct, onClose }: { type: RoomTypeInfo; search: { check_in: string; check_out: string; adults: number; children: number }; quote: StayQuote; advancePct: number; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const money = useMoney();
  const navigate = useNavigate();
  const [c, setC] = useState(savedContact);
  const [extra, setExtra] = useState({ arrival_time: '', requests: '', business: false, company: '', gstin: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const advance = advancePct ? Math.ceil((Number(quote.total) * advancePct) / 100) : 0;
  useEffect(() => {
    document.getElementById('booking-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (c.name.trim().length < 2) er.name = t('order.err.name');
    if (!isIndianMobile(c.phone)) er.phone = t('order.err.phone');
    if (c.email && !/^\S+@\S+\.\S+$/.test(c.email)) er.email = t('order.err.email');
    if (extra.business && extra.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(extra.gstin.toUpperCase())) er.gstin = t('site.stay.gstinInvalid');
    setErrors(er);
    if (Object.keys(er).length) return;
    setSending(true);
    setFormError('');
    try {
      try {
        localStorage.setItem(CONTACT_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(CONTACT_KEY) ?? '{}'), name: c.name, phone: c.phone, email: c.email }));
      } catch {
        /* ignore */
      }
      const res = await api.post<{ booking: GuestStay; token: string; razorpay: Record<string, unknown> | null }>('/site/hotel/bookings', {
        room_type_id: type.id, ...search, name: c.name, phone: c.phone, email: c.email || null,
        arrival_time: extra.arrival_time || null, requests: extra.requests || null,
        company: extra.business ? extra.company || null : null, gstin: extra.business && extra.gstin ? extra.gstin.toUpperCase() : null,
      });
      const { booking, token, razorpay } = res.data;
      rememberStay(window.location.host, booking.id, token, booking.code);
      if (razorpay) await payAdvance(booking.id, token, razorpay);
      navigate(`/stay/${booking.id}?t=${token}&booked=1`);
    } catch (err) {
      const ae = err as ApiError;
      if (ae.errors) setErrors(Object.fromEntries(Object.entries(ae.errors).map(([k, v]) => [k, v[0]])));
      setFormError(ae.message);
    } finally {
      setSending(false);
    }
  };
  const field = (k: 'name' | 'phone' | 'email', label: string, props: Record<string, unknown>, optional = false) => (
    <label className="block">
      <span className="text-sm font-bold">{label}{optional && <span className="s-muted font-normal"> ({t('order.optional')})</span>}</span>
      <input className="s-input mt-1.5" value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `bk-err-${k}` : undefined} {...props} />
      <ErrorText id={`bk-err-${k}`}>{errors[k]}</ErrorText>
    </label>
  );
  return (
    <section id="booking-form" className="s-grid scroll-mt-28 gap-y-6" aria-labelledby="booking-h">
      <form className="s-card col-span-4 space-y-4 p-5 sm:p-6 md:col-span-7" onSubmit={submit} noValidate>
        <div className="flex items-start justify-between gap-3">
          <h2 id="booking-h" className="s-h3">{t('site.stay.yourDetails')}</h2>
          <button type="button" className="s-small underline" onClick={onClose}>{t('site.stay.changeRoom')}</button>
        </div>
        {field('name', t('order.name'), { autoComplete: 'name', maxLength: 120 })}
        {field('phone', t('order.phone'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel' })}
        {field('email', t('order.email'), { type: 'email', autoComplete: 'email' }, true)}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold">{t('site.stay.arrival')} <span className="s-muted font-normal">({t('order.optional')})</span></span>
            <input type="time" className="s-input mt-1.5" value={extra.arrival_time} onChange={(e) => setExtra({ ...extra, arrival_time: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-bold">{t('site.stay.requests')} <span className="s-muted font-normal">({t('order.optional')})</span></span>
            <input className="s-input mt-1.5" maxLength={500} placeholder={t('site.stay.requestsHint')} value={extra.requests} onChange={(e) => setExtra({ ...extra, requests: e.target.value })} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={extra.business} onChange={(e) => setExtra({ ...extra, business: e.target.checked })} /> {t('site.stay.business')}</label>
        {extra.business && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="text-sm font-bold">{t('site.stay.company')}</span><input className="s-input mt-1.5" maxLength={120} value={extra.company} onChange={(e) => setExtra({ ...extra, company: e.target.value })} /></label>
            <label className="block"><span className="text-sm font-bold">GSTIN</span><input className="s-input mt-1.5 uppercase" maxLength={15} value={extra.gstin} aria-invalid={!!errors.gstin} onChange={(e) => setExtra({ ...extra, gstin: e.target.value })} /><ErrorText id="bk-err-gstin">{errors.gstin}</ErrorText></label>
          </div>
        )}
        {formError && <Notice>{formError}</Notice>}
        <button type="submit" className="s-btn s-btn-primary s-btn-block" disabled={sending}>
          {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {advance ? t('site.stay.payAdvance', { amount: money(advance) }) : t('site.stay.confirm')}
        </button>
        <p className="s-small s-muted">{advance ? t('site.stay.advanceHint', { rest: money(Number(quote.total) - advance) }) : t('site.stay.payAtHotel')}</p>
      </form>
      <aside className="s-card col-span-4 h-fit space-y-3 p-5 sm:p-6 md:col-span-5">
        <h2 className="s-h3">{l(type, 'name')}</h2>
        <p className="font-semibold">{ymdLabel(search.check_in, i18n.language)} → {ymdLabel(search.check_out, i18n.language)}</p>
        <p className="s-small s-muted">{t('site.stay.guests', { adults: search.adults, children: search.children })}</p>
        <PriceLines quote={quote} />
      </aside>
    </section>
  );
}

/** /stay/:id?t=…: the guest's booking (status, price, pay the advance, cancel). */
export function StayPage({ site }: { site: SiteData }) {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const money = useMoney();
  const qc = useQueryClient();
  const { id } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t');
  const q = useGuestStay(id, token);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const s = q.data;

  const cancel = async () => {
    setBusy(true);
    try {
      const r = await api.post<GuestStay>(`/site/hotel/bookings/${id}/cancel`, { t: token });
      qc.setQueryData(['site', 'stay', id, token], r.data);
      setMsg({ tone: 'ok', text: t('site.stay.cancelled') });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };
  const pay = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ razorpay: Record<string, unknown> }>(`/site/hotel/bookings/${id}/pay`, { t: token });
      await payAdvance(id!, token!, r.data.razorpay);
      await q.refetch();
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!token) return <Navigate to="/stay" replace />;
  return (
    <>
      <PageHeader site={site} eyebrow={site.name} title={s ? t('site.stay.bookingTitle', { code: s.code }) : t('site.stay.yourBooking')}
        lead={params.get('booked') && s?.status !== 'cancelled' ? <span className="inline-flex items-center gap-2 font-semibold text-t-text"><CheckCircle2 className="h-5 w-5 text-[#1f8a4c]" aria-hidden="true" />{s?.status === 'confirmed' ? t('site.stay.bookedConfirmed') : t('site.stay.bookedPending')}</span> : null} />
      <div className="s-wrap s-grid gap-y-8 pb-24">
        <div className="col-span-4 space-y-4 md:col-span-7">
          {q.isLoading && <div className="s-card h-48 animate-pulse" />}
          {q.isError && <div className="s-card p-6"><p className="font-semibold">{(q.error as Error).message}</p><Link to="/stay" className="s-btn s-btn-secondary mt-4">{t('site.stay.findBooking')}</Link></div>}
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          {s && (
            <article className="s-card space-y-4 p-5 sm:p-6">
              <p className={`s-status ${s.status === 'confirmed' || s.status === 'checked_in' ? 'is-open' : ''}`}><span className="s-status-dot" aria-hidden="true" />{t(`site.stay.status.${s.status}`)}</p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div><dt className="s-small s-muted">{t('site.stay.room')}</dt><dd className="font-semibold">{l(s.room_type, 'name')}</dd></div>
                <div><dt className="s-small s-muted">{t('site.stay.dates')}</dt><dd className="font-semibold">{ymdLabel(s.check_in, i18n.language)} → {ymdLabel(s.check_out, i18n.language)} · {t('site.stay.nights', { count: s.nights })}</dd></div>
                <div><dt className="s-small s-muted">{t('site.stay.guestsLabel')}</dt><dd className="font-semibold">{t('site.stay.guests', { adults: s.adults, children: s.children })}</dd></div>
                <div><dt className="s-small s-muted">{t('site.stay.name')}</dt><dd className="font-semibold">{s.name}</dd></div>
                {s.requests && <div className="sm:col-span-2"><dt className="s-small s-muted">{t('site.stay.requests')}</dt><dd>{s.requests}</dd></div>}
              </dl>
              {s.awaiting_payment && (
                <div className="space-y-2 rounded-[var(--t-radius-input)] bg-t-surface-2 p-4">
                  <p className="font-semibold">{t('site.stay.awaiting', { amount: money(s.advance_due) })}</p>
                  <button type="button" className="s-btn s-btn-primary" onClick={() => void pay()} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t('site.stay.payNow')}</button>
                </div>
              )}
              {s.status === 'pending' && !s.awaiting_payment && <p>{t('site.stay.pendingText')}</p>}
              {s.status === 'cancelled' && <p>{s.cancelled_by === 'system' ? t('site.stay.expired') : t('site.stay.cancelledText')}</p>}
              <div className="flex flex-wrap gap-3">
                {s.can_cancel && !confirmCancel && <button type="button" className="s-btn s-btn-secondary" onClick={() => setConfirmCancel(true)}>{t('site.stay.cancel')}</button>}
                {confirmCancel && (
                  <div className="space-y-2">
                    <p className="font-semibold">{t('site.stay.cancelSure')}</p>
                    <div className="flex gap-2">
                      <button type="button" className="s-btn s-btn-primary" onClick={() => void cancel()} disabled={busy}>{t('site.stay.cancelYes')}</button>
                      <button type="button" className="s-btn s-btn-secondary" onClick={() => setConfirmCancel(false)}>{t('site.stay.keep')}</button>
                    </div>
                  </div>
                )}
                {!s.can_cancel && (s.status === 'confirmed' || s.status === 'pending') && <p className="s-small s-muted">{t('site.stay.callToChange')}</p>}
                {site.content.contact.phone && <a className="s-btn s-btn-secondary" href={telHref(site.content.contact.phone)}>{t('site.call')}</a>}
              </div>
            </article>
          )}
        </div>
        {s && (
          <aside className="s-card col-span-4 h-fit space-y-2 p-5 sm:p-6 md:col-span-5">
            <h2 className="s-h3">{t('site.stay.price')}</h2>
            <PriceLines quote={{ nights: s.nights, room_total: s.room_total, tax_total: s.tax_total, total: s.total, rates: s.rates.map((r) => ({ ...r, tax_rate: '', season: null, weekend: false })) }} />
            {Number(s.paid) > 0 && <p className="s-small flex justify-between font-semibold"><span>{t('site.stay.paid')}</span><span>{money(s.paid)}</span></p>}
          </aside>
        )}
      </div>
    </>
  );
}

/** /stay: find a booking with its ID and phone number. */
export function StayLookupPage({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const remembered = rememberedStays(window.location.host);
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState(savedContact().phone);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ id: string; t: string }>('/site/hotel/bookings/lookup', { code, phone });
      navigate(`/stay/${r.data.id}?t=${r.data.t}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader site={site} eyebrow={site.name} title={t('site.stay.lookupTitle')} lead={t('site.stay.lookupLead')} />
      <div className="s-wrap s-grid gap-y-8 pb-24">
        <form className="s-card col-span-4 space-y-4 p-5 sm:p-6 md:col-span-6" onSubmit={submit}>
          <label className="block"><span className="text-sm font-bold">{t('site.stay.code')}</span><input className="s-input mt-1.5 font-mono uppercase" maxLength={12} required value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" /></label>
          <label className="block"><span className="text-sm font-bold">{t('order.phone')}</span><input className="s-input mt-1.5" type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          {error && <Notice>{error}</Notice>}
          <button type="submit" className="s-btn s-btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t('site.stay.find')}</button>
        </form>
        {!!remembered.length && (
          <aside className="s-card col-span-4 h-fit space-y-2 p-5 sm:p-6 md:col-span-6">
            <h2 className="s-h3">{t('site.stay.onThisDevice')}</h2>
            <ul className="space-y-1">{remembered.map((s) => <li key={s.id}><Link className="underline" to={`/stay/${s.id}?t=${s.token}`}>{s.code}</Link></li>)}</ul>
          </aside>
        )}
      </div>
    </>
  );
}

/** /r/:token: a guest scanned the QR in their room. Remember the room and open the menu. */
export function RoomLanding({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const join = useRoom((s) => s.join);
  const q = useQuery({
    queryKey: ['site', 'room', token],
    queryFn: async () => (await api.get<{ number: string; type: string; room_service: boolean; occupied: boolean }>(`/site/hotel/rooms/${token}`)).data,
    enabled: !!site.features.hotel,
    retry: false,
  });
  const ready = q.data?.room_service && q.data.occupied && site.has_menu;
  useEffect(() => {
    if (!ready) return;
    join(token, q.data!.number);
    navigate('/menu', { replace: true });
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading || ready) {
    return <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true"><Loader2 className="h-8 w-8 animate-spin opacity-60" aria-label={t('common.loading')} /></div>;
  }
  const lead = q.isError ? t('site.room.badQrText') : !q.data?.room_service ? t('site.room.offText') : !q.data.occupied ? t('site.room.notCheckedIn') : t('site.room.noMenu');
  return (
    <>
      <PageHeader site={site} eyebrow={site.name} title={q.data ? t('site.room.title', { number: q.data.number }) : t('site.room.badQr')} lead={lead} />
      <div className="s-wrap flex flex-wrap gap-3 pb-20">
        {site.has_menu && <Link to="/menu" className="s-btn s-btn-primary">{t('site.viewMenu')}</Link>}
        {site.content.contact.phone && <a href={telHref(site.content.contact.phone)} className="s-btn s-btn-secondary">{t('site.room.callReception')}</a>}
      </div>
    </>
  );
}

/** Bottom bar while ordering to a room: the room, the cart, and leaving room mode. */
export function RoomBar({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { pathname } = useLocation();
  const room = useActiveRoom(site);
  const leave = useRoom((s) => s.leave);
  const lines = useCart((s) => s.lines);
  const setOpen = useCart((s) => s.setOpen);
  if (!room || pathname.startsWith('/checkout') || pathname.startsWith('/r/')) return null;
  const count = cartCount(lines);
  return (
    <nav className="s-bar s-table-bar" aria-label={t('site.room.barLabel', { number: room.number })}>
      <span className="flex items-center gap-1.5 truncate px-3 font-semibold"><BedDouble className="h-[18px] w-[18px]" aria-hidden="true" />{t('site.room.short', { number: room.number })}</span>
      <button type="button" onClick={leave}><LogOut className="h-[18px] w-[18px]" aria-hidden="true" />{t('site.room.leave')}</button>
      {count > 0 ? (
        <button type="button" className="is-main" onClick={() => setOpen(true)} aria-label={t('order.viewCart', { count })}>
          <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="tabular-nums">{count} · {money(cartEstimate(lines))}</span>
        </button>
      ) : (
        <Link to="/menu" className="is-main"><UtensilsCrossed className="h-[18px] w-[18px]" aria-hidden="true" />{t('site.bar.menu')}</Link>
      )}
    </nav>
  );
}

/** Checkout for room service: charged to the room after the guest confirms their phone's last 4 digits. */
export function RoomCheckout({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const money = useMoney();
  const navigate = useNavigate();
  const room = useActiveRoom(site)!;
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const quote = useQuote('room_service');
  const [pin, setPin] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const placed = useRef(false);
  const items = useMemo(() => apiLines(lines), [lines]);

  // Once placed, the cart empties: don't bounce back to the menu on the way to the order page.
  if (!lines.length && !placed.current) return <Navigate to="/menu" replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      setError(t('site.room.pinError'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ order: CustomerOrder; token: string }>('/site/orders', { type: 'room_service', payment_method: 'room', room_token: room.token, room_pin: pin, notes: notes || null, items });
      rememberOrder(window.location.host, r.data.order.id, r.data.token, r.data.order.number);
      placed.current = true;
      navigate(`/order/${r.data.order.id}?t=${r.data.token}&placed=1`, { replace: true });
      clear();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader site={site} eyebrow={site.name} title={t('site.room.checkoutTitle', { number: room.number })} lead={t('site.room.checkoutLead')} />
      <form className="s-wrap s-grid gap-y-8 pb-24" onSubmit={submit} noValidate>
        <div className="s-card col-span-4 space-y-4 p-5 sm:p-6 md:col-span-7">
          <label className="block">
            <span className="text-sm font-bold">{t('site.room.pin')}</span>
            <input className="s-input mt-1.5 max-w-[10rem] text-center font-mono text-xl tracking-[0.4em]" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-describedby="pin-hint" />
            <span id="pin-hint" className="s-small s-muted mt-1.5 block">{t('site.room.pinHint')}</span>
          </label>
          <label className="block">
            <span className="text-sm font-bold">{t('order.notesForKitchen')} <span className="s-muted font-normal">({t('order.optional')})</span></span>
            <textarea className="s-input mt-1.5 py-2.5" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {error && <Notice>{error}</Notice>}
          <button type="submit" className="s-btn s-btn-primary s-btn-block" disabled={busy || quote.isError}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t('site.room.place')}</button>
          <p className="s-small s-muted">{t('site.room.chargeNote')}</p>
        </div>
        <aside className="s-card col-span-4 h-fit space-y-3 p-5 sm:p-6 md:col-span-5">
          <h2 className="s-h3">{t('order.yourOrder')}</h2>
          <ul className="s-small space-y-1">{lines.map((x) => <li key={x.key} className="flex justify-between gap-2"><span>{x.quantity} × {l(x, 'name')}</span><span className="tabular-nums">{money(x.unit_price * x.quantity)}</span></li>)}</ul>
          {quote.data && <BillSummary quote={quote.data} deliveryPending={false} />}
          {quote.isError && <Notice>{(quote.error as Error).message}</Notice>}
        </aside>
      </form>
    </>
  );
}

/** /events: banquet and event enquiries. */
export function EventsPage({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const today = ymdToday(site.timezone);
  const [f, setF] = useState({ ...savedContact(), event_type: 'wedding', event_date: '', guests: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!site.hotel?.banquets) return <Navigate to="/" replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (f.name.trim().length < 2) er.name = t('order.err.name');
    if (!isIndianMobile(f.phone)) er.phone = t('order.err.phone');
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/site/hotel/banquets', { name: f.name, phone: f.phone, email: f.email || null, event_type: f.event_type, event_date: f.event_date || null, guests: f.guests ? Number(f.guests) : null, message: f.message || null });
      setSent(true);
    } catch (err) {
      const ae = err as ApiError;
      if (ae.errors) setErrors(Object.fromEntries(Object.entries(ae.errors).map(([k, v]) => [k, v[0]])));
      setError(ae.message);
    } finally {
      setBusy(false);
    }
  };
  const input = (k: 'name' | 'phone' | 'email', label: string, props: Record<string, unknown>, optional = false) => (
    <label className="block">
      <span className="text-sm font-bold">{label}{optional && <span className="s-muted font-normal"> ({t('order.optional')})</span>}</span>
      <input className="s-input mt-1.5" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `ev-err-${k}` : undefined} {...props} />
      <ErrorText id={`ev-err-${k}`}>{errors[k]}</ErrorText>
    </label>
  );
  return (
    <>
      <PageHeader site={site} banner eyebrow={site.name} title={t('site.events.title')} lead={t('site.events.lead')} />
      <div className="s-wrap s-grid gap-y-8 pb-24">
        {sent ? (
          <div className="s-card col-span-4 space-y-3 p-6 md:col-span-7" role="status">
            <PartyPopper className="h-8 w-8" aria-hidden="true" />
            <p className="s-h3">{t('site.events.thanks')}</p>
            <p>{t('site.events.thanksText')}</p>
          </div>
        ) : (
          <form className="s-card col-span-4 space-y-4 p-5 sm:p-6 md:col-span-7" onSubmit={submit} noValidate>
            {input('name', t('order.name'), { autoComplete: 'name', maxLength: 120 })}
            {input('phone', t('order.phone'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel' })}
            {input('email', t('order.email'), { type: 'email', autoComplete: 'email' }, true)}
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block"><span className="text-sm font-bold">{t('site.events.type')}</span>
                <select className="s-input mt-1.5" value={f.event_type} onChange={(e) => setF({ ...f, event_type: e.target.value })}>{['wedding', 'birthday', 'anniversary', 'corporate', 'other'].map((k) => <option key={k} value={k}>{t(`hotel.event.${k}`)}</option>)}</select>
              </label>
              <label className="block"><span className="text-sm font-bold">{t('site.events.date')} <span className="s-muted font-normal">({t('order.optional')})</span></span><input type="date" min={today} className="s-input mt-1.5" value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} /></label>
              <label className="block"><span className="text-sm font-bold">{t('site.events.guests')} <span className="s-muted font-normal">({t('order.optional')})</span></span><input type="number" min={1} max={5000} className="s-input mt-1.5" value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })} /></label>
            </div>
            <label className="block"><span className="text-sm font-bold">{t('site.events.message')} <span className="s-muted font-normal">({t('order.optional')})</span></span><textarea rows={3} maxLength={1000} className="s-input mt-1.5 py-2.5" placeholder={t('site.events.messageHint')} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></label>
            {error && <Notice>{error}</Notice>}
            <button type="submit" className="s-btn s-btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t('site.events.send')}</button>
            <p className="s-small s-muted">{t('site.events.privacy')}</p>
          </form>
        )}
        {site.content.contact.phone && (
          <aside className="s-card col-span-4 h-fit space-y-2 p-5 sm:p-6 md:col-span-5">
            <p className="s-h3">{t('site.events.call')}</p>
            <a className="s-btn s-btn-secondary" href={telHref(site.content.contact.phone)}>{t('site.call')}</a>
          </aside>
        )}
      </div>
    </>
  );
}
