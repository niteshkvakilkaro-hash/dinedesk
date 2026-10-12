import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, Clock, Loader2, Minus, Plus, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatTime, isIndianMobile } from '@/lib/format';
import type { SiteData } from '../types';
import { formatDay, nextDates, rememberBooking, rememberedBookings, useAvailability, type GuestReservation } from '../reservations';
import { PageHeader } from './pages';
import { Reserve } from './sections';

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
  return (
    <span id={id} role="alert" className="mt-1.5 block text-sm font-semibold text-[var(--s-error)]">
      {children}
    </span>
  );
}

/** Booking ID, status and what happens next. */
export function BookingCard({ booking, site, children }: { booking: GuestReservation; site: SiteData; children?: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const tone = booking.status === 'confirmed' || booking.status === 'seated' || booking.status === 'completed' ? 'is-open' : '';
  return (
    <div className="s-card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="s-eyebrow">{t('site.res.bookingId')}</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.2em]">{booking.code}</p>
        </div>
        <p className={`s-status ${tone}`}>
          <span className="s-status-dot" aria-hidden="true" />
          {t(`site.res.status.${booking.status}`)}
        </p>
      </div>
      <dl className="mt-6 grid gap-4 border-t border-t-line pt-6 sm:grid-cols-3">
        <div className="flex gap-3">
          <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-t-link" aria-hidden="true" />
          <div>
            <dt className="s-small s-muted">{t('site.res.date')}</dt>
            <dd className="font-semibold">{formatDay(booking.date, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}</dd>
          </div>
        </div>
        <div className="flex gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-t-link" aria-hidden="true" />
          <div>
            <dt className="s-small s-muted">{t('site.res.time')}</dt>
            <dd className="font-semibold">{formatTime(booking.time)}</dd>
          </div>
        </div>
        <div className="flex gap-3">
          <Users className="mt-0.5 h-5 w-5 shrink-0 text-t-link" aria-hidden="true" />
          <div>
            <dt className="s-small s-muted">{t('site.res.guests')}</dt>
            <dd className="font-semibold">{t('site.res.guestCount', { count: booking.party_size })}</dd>
          </div>
        </div>
      </dl>
      <p className="s-small s-muted mt-6">{t(`site.res.statusHelp.${booking.status}`, { name: site.name })}</p>
      {children}
    </div>
  );
}

export function ReservePage({ site }: { site: SiteData }) {
  const { t, i18n } = useTranslation();
  const r = site.reservations;
  const dates = useMemo(() => nextDates(site.timezone, Math.min(r.max_days, 60)), [site.timezone, r.max_days]);
  const blackout = new Set(r.blackout_dates.map((b) => b.date));
  const [party, setParty] = useState(Math.min(Math.max(2, r.min_party), r.max_party));
  const [date, setDate] = useState<string>(() => dates.find((d) => !blackout.has(d)) ?? dates[0]);
  const [time, setTime] = useState('');
  const [contact, setContact] = useState(savedContact);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const [booked, setBooked] = useState<GuestReservation | null>(null);
  const day = useAvailability(r.enabled ? date : null, party);

  // A time picked for another day or party size may not exist there.
  useEffect(() => {
    if (time && day.data && !day.data.slots.some((s) => s.time === time && s.available)) setTime('');
  }, [day.data, time]);

  if (!r.enabled) {
    return (
      <>
        <PageHeader site={site} eyebrow={site.name} title={t('site.reserveTitle')} lead={t('site.res.offline')} />
        <Reserve site={site} />
        <div className="pb-16" />
      </>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const errs: Record<string, string> = {};
    if (!time) errs.time = t('site.res.err.time');
    if (contact.name.trim().length < 2) errs.name = t('order.err.name');
    if (!isIndianMobile(contact.phone)) errs.phone = t('order.err.phone');
    if (contact.email && !/^\S+@\S+\.\S+$/.test(contact.email)) errs.email = t('order.err.email');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSending(true);
    try {
      const res = await api.post<GuestReservation>('/site/reservations', { date, time, party_size: party, name: contact.name, phone: contact.phone, email: contact.email || null, notes: notes || null });
      try {
        localStorage.setItem(CONTACT_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(CONTACT_KEY) ?? '{}'), ...contact }));
      } catch {
        /* ignore */
      }
      rememberBooking(window.location.host, res.data.code, contact.phone);
      setBooked(res.data);
      window.scrollTo({ top: 0 });
    } catch (err) {
      const ae = err as ApiError;
      if (ae.errors) setErrors(Object.fromEntries(Object.entries(ae.errors).map(([k, v]) => [k, v[0]])));
      setFormError(ae.message);
      void day.refetch();
    } finally {
      setSending(false);
    }
  };

  if (booked) {
    return (
      <>
        <PageHeader site={site} eyebrow={site.name} title={booked.status === 'confirmed' ? t('site.res.doneConfirmed') : t('site.res.doneRequested')} />
        <div className="s-wrap max-w-3xl pb-20" aria-live="polite">
          <BookingCard booking={booked} site={site}>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={`/reservation?code=${booked.code}`} className="s-btn s-btn-secondary">
                {t('site.res.manage')}
              </Link>
              {site.has_menu && (
                <Link to="/menu" className="s-btn s-btn-primary">
                  {t('site.viewMenu')}
                </Link>
              )}
            </div>
          </BookingCard>
        </div>
      </>
    );
  }

  const slots = day.data?.slots ?? [];
  const free = slots.filter((s) => s.available);
  const input = (key: 'name' | 'phone' | 'email', label: string, props: React.InputHTMLAttributes<HTMLInputElement>, optional = false) => (
    <label className="block">
      <span className="text-sm font-bold">
        {label}
        {optional && <span className="s-muted font-normal"> ({t('order.optional')})</span>}
      </span>
      <input
        {...props}
        value={contact[key]}
        onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `res-err-${key}` : undefined}
        className="s-input mt-1.5"
      />
      <ErrorText id={`res-err-${key}`}>{errors[key]}</ErrorText>
    </label>
  );

  return (
    <>
      <PageHeader site={site} eyebrow={site.name} title={t('site.reserveTitle')} lead={r.auto_confirm ? t('site.res.leadInstant') : t('site.res.leadRequest')} />
      <form className="s-wrap s-grid gap-y-8 pb-20" onSubmit={submit} noValidate>
        <div className="col-span-4 min-w-0 space-y-8 md:col-span-7">
          <fieldset className="s-card min-w-0 p-5 sm:p-6">
            <legend className="sr-only">{t('site.res.guests')}</legend>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="s-h3" aria-hidden="true">
                {t('site.res.howMany')}
              </p>
              <div className="s-chip !px-1" role="group" aria-label={t('site.res.guests')}>
                <button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-40" disabled={party <= r.min_party} onClick={() => setParty(party - 1)} aria-label={t('site.res.fewer')}>
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="min-w-20 text-center text-base font-bold tabular-nums" aria-live="polite">
                  {t('site.res.guestCount', { count: party })}
                </span>
                <button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-40" disabled={party >= r.max_party} onClick={() => setParty(party + 1)} aria-label={t('site.res.more')}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <p className="s-small s-muted mt-3">{t('site.res.bigGroups', { count: r.max_party })}</p>
          </fieldset>

          <fieldset className="s-card min-w-0 p-5 sm:p-6">
            <legend className="s-h3 float-left mb-4 w-full">{t('site.res.pickDay')}</legend>
            <div className="s-tabs clear-both" role="radiogroup" aria-label={t('site.res.pickDay')}>
              {dates.map((d, i) => {
                const off = blackout.has(d);
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={date === d}
                    disabled={off}
                    onClick={() => setDate(d)}
                    className="s-chip !min-h-16 shrink-0 flex-col !gap-0 !px-4 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="text-xs font-semibold uppercase opacity-80">{i === 0 ? t('site.today') : formatDay(d, i18n.language, { weekday: 'short' })}</span>
                    <span className="text-base">{formatDay(d, i18n.language, { day: 'numeric', month: 'short' })}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="s-card min-w-0 p-5 sm:p-6" aria-describedby={errors.time ? 'res-err-time' : undefined}>
            <legend className="s-h3 float-left mb-4 w-full">{t('site.res.pickTime')}</legend>
            <div className="clear-both" aria-live="polite" aria-busy={day.isFetching}>
              {day.isLoading && <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <span key={i} className="h-12 animate-pulse rounded-[var(--t-radius-btn)] bg-t-surface-2" />)}</div>}
              {day.data?.problem && <p className="font-semibold">{day.data.problem.message}</p>}
              {day.data && !day.data.problem && !free.length && <p className="font-semibold">{slots.length ? t('site.res.dayFull') : t('site.res.noTimes')}</p>}
              {free.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t('site.res.pickTime')}>
                  {slots.map((s) => (
                    <button key={s.time} type="button" role="radio" aria-checked={time === s.time} disabled={!s.available} onClick={() => setTime(s.time)} className="s-chip justify-center !min-h-12 tabular-nums disabled:cursor-not-allowed disabled:line-through disabled:opacity-40">
                      {formatTime(s.time)}
                    </button>
                  ))}
                </div>
              )}
              {day.isError && <p role="alert" className="font-semibold text-[var(--s-error)]">{(day.error as Error).message}</p>}
            </div>
            <ErrorText id="res-err-time">{errors.time}</ErrorText>
          </fieldset>
        </div>

        <div className="col-span-4 md:col-span-5">
          <div className="s-card space-y-5 p-5 sm:p-6 md:sticky md:top-[calc(var(--s-header-h)+24px)]">
            <h2 className="s-h3">{t('site.res.yourDetails')}</h2>
            {input('name', t('order.name'), { autoComplete: 'name' })}
            {input('phone', t('order.phone'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel' })}
            {input('email', t('order.email'), { type: 'email', autoComplete: 'email' }, true)}
            <label className="block">
              <span className="text-sm font-bold">
                {t('site.res.notes')} <span className="s-muted font-normal">({t('order.optional')})</span>
              </span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} placeholder={t('site.res.notesHint')} className="s-input mt-1.5 py-2.5" />
            </label>
            <div className="s-small rounded-[var(--t-radius-input)] bg-t-surface-2 p-3">
              <p className="font-bold">
                {formatDay(date, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
                {time && ` · ${formatTime(time)}`}
              </p>
              <p>{t('site.res.guestCount', { count: party })}</p>
            </div>
            {formError && (
              <p role="alert" className="s-small rounded-[var(--t-radius-input)] bg-[#fee2e2] px-3 py-2 font-semibold text-[#991b1b]">
                {formError}
              </p>
            )}
            <button type="submit" className="s-btn s-btn-primary s-btn-block" disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {r.auto_confirm ? t('site.res.bookNow') : t('site.res.requestNow')}
            </button>
            <p className="s-small s-muted">{t('site.res.privacy')}</p>
          </div>
        </div>
      </form>
    </>
  );
}

/** Check or cancel a booking with its ID and phone number. */
export function ReservationLookupPage({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const remembered = rememberedBookings(window.location.host);
  const initialCode = (params.get('code') ?? '').toUpperCase();
  const [code, setCode] = useState(initialCode);
  const [phone, setPhone] = useState(params.get('phone') ?? remembered.find((b) => b.code === initialCode)?.phone ?? '');
  const [booking, setBooking] = useState<GuestReservation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notice, setNotice] = useState('');

  const call = async (path: 'lookup' | 'cancel', c = code, p = phone) => {
    setError('');
    setBusy(true);
    try {
      const res = await api.post<GuestReservation>(`/site/reservations/${path}`, { code: c, phone: p });
      setBooking(res.data);
      if (path === 'cancel') setNotice(t('site.res.cancelled'));
      setConfirmCancel(false);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  // Opened from this device's own booking link: look it up straight away.
  useEffect(() => {
    if (initialCode && phone) void call('lookup', initialCode, phone);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader site={site} eyebrow={site.name} title={t('site.res.lookupTitle')} lead={t('site.res.lookupLead')} />
      <div className="s-wrap max-w-3xl space-y-6 pb-20">
        {booking ? (
          <div aria-live="polite">
            {notice && <p className="s-card mb-4 p-4 font-semibold">{notice}</p>}
            <BookingCard booking={booking} site={site}>
              <div className="mt-6 flex flex-wrap gap-3">
                {booking.cancellable &&
                  (confirmCancel ? (
                    <>
                      <button type="button" className="s-btn s-btn-primary" disabled={busy} onClick={() => void call('cancel', booking.code)}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        {t('site.res.yesCancel')}
                      </button>
                      <button type="button" className="s-btn s-btn-secondary" onClick={() => setConfirmCancel(false)}>
                        {t('site.res.keep')}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="s-btn s-btn-secondary" onClick={() => setConfirmCancel(true)}>
                      {t('site.res.cancel')}
                    </button>
                  ))}
                <button type="button" className="s-btn s-btn-secondary" onClick={() => { setBooking(null); setNotice(''); }}>
                  {t('site.res.another')}
                </button>
              </div>
              {error && <p role="alert" className="mt-4 font-semibold text-[var(--s-error)]">{error}</p>}
            </BookingCard>
          </div>
        ) : (
          <form className="s-card grid gap-5 p-5 sm:grid-cols-2 sm:p-6" onSubmit={(e) => { e.preventDefault(); void call('lookup'); }}>
            <label className="block">
              <span className="text-sm font-bold">{t('site.res.bookingId')}</span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} autoCapitalize="characters" autoComplete="off" className="s-input mt-1.5 font-mono tracking-[0.2em]" required />
            </label>
            <label className="block">
              <span className="text-sm font-bold">{t('order.phone')}</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" className="s-input mt-1.5" required />
            </label>
            {error && (
              <p role="alert" className="font-semibold text-[var(--s-error)] sm:col-span-2">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button type="submit" className="s-btn s-btn-primary" disabled={busy || !code || !phone}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {t('site.res.find')}
              </button>
              {site.reservations.enabled && (
                <Link to="/reserve" className="s-link">
                  {t('site.res.newBooking')}
                </Link>
              )}
            </div>
            {remembered.length > 0 && (
              <div className="sm:col-span-2">
                <p className="s-small s-muted mb-2">{t('site.res.onThisDevice')}</p>
                <div className="flex flex-wrap gap-2">
                  {remembered.map((b) => (
                    <button key={b.code} type="button" className="s-chip font-mono" onClick={() => { setCode(b.code); setPhone(b.phone); void call('lookup', b.code, b.phone); }}>
                      {b.code}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}
      </div>
    </>
  );
}
