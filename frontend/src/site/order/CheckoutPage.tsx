import { useEffect, useMemo, useState } from 'react';
import { intlLocale } from '@/i18n/locale';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Crosshair, Loader2, MapPin } from 'lucide-react';
import { useGuestAccount, useGuestUpdate, type GuestAddress } from '../account';
import { api, ApiError } from '@/lib/api';
import { isIndianMobile } from '@/lib/format';
import { apiLines, cartCount, lineExtras, useCart } from '../cart';
import { useLocalized, useOpenStatus } from '../data';
import { loadRazorpay, rememberOrder, useMoney, useQuote } from '../ordering';
import type { CustomerOrder, OrderType, PaymentMethod, SiteData } from '../types';
import { FoodTypeMark } from '../components/bits';
import { BillSummary, OrderTypePicker } from './Cart';
import { scheduleSlots } from './schedule';
import { useSkin } from './skin';
import { useActiveTable } from '../table';
import { Offers, type OfferState } from './Offers';

const CONTACT_KEY = 'dd_checkout_contact';

interface Contact {
  name: string;
  phone: string;
  email: string;
  line1: string;
  line2: string;
  landmark: string;
  pincode: string;
}

function loadContact(): Contact {
  const empty = { name: '', phone: '', email: '', line1: '', line2: '', landmark: '', pincode: '' };
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(CONTACT_KEY) ?? '{}') };
  } catch {
    return empty;
  }
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (r: unknown) => void) => void };
  }
}

export default function CheckoutPage({ site }: { site: SiteData }) {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const skin = useSkin();
  const money = useMoney();
  const navigate = useNavigate();
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const storedType = useCart((s) => s.type);
  const setStoredType = useCart((s) => s.setType);
  const status = useOpenStatus(site);
  const ordering = site.ordering;
  // Scanned a table's QR: the order goes to that table's running bill.
  const activeTable = useActiveTable(site);
  const table = activeTable && ordering.types.includes('dine_in') ? activeTable : null;

  const type: OrderType = table ? 'dine_in' : storedType && ordering.types.includes(storedType) ? storedType : ordering.types[0];
  const [contact, setContact] = useState<Contact>(loadContact);
  // Signed in on this website: their name and phone to start with, and their saved addresses.
  const me = useGuestAccount().data;
  const saveAddresses = useGuestUpdate();
  const [saveAddr, setSaveAddr] = useState(true);
  useEffect(() => {
    if (me) setContact((c) => ({ ...c, name: c.name || me.name || '', phone: c.phone || me.phone.slice(3) }));
  }, [me]);
  const sameAddress = (a: GuestAddress) => a.line1 === contact.line1.trim() && a.pincode === contact.pincode;
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [notes, setNotes] = useState('');
  const [when, setWhen] = useState<'now' | 'later'>(status && !status.is_open && !table ? 'later' : 'now');
  const [slotDay, setSlotDay] = useState('');
  const [slot, setSlot] = useState('');
  const methods = ordering.payment_methods[type] ?? [];
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [offers, setOffers] = useState<OfferState>({ coupon: null, loyalty: null });
  const [optIn, setOptIn] = useState(false);

  useEffect(() => {
    if (!methods.includes(method as PaymentMethod)) setMethod(methods[0] ?? '');
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(
    () => (site.opening_hours && ordering.scheduling.enabled ? scheduleSlots(site.opening_hours, site.holidays, site.timezone, ordering.prep_minutes + (type === 'delivery' ? ordering.delivery_minutes : 0), ordering.scheduling.max_days, Date.now(), i18n.language) : []),
    [site, ordering, type, i18n.language],
  );
  const day = days.find((d) => d.date === slotDay) ?? days[0];

  const quote = useQuote(type, type === 'delivery' ? { pincode: contact.pincode, lat: geo?.lat, lng: geo?.lng } : {}, {
    coupon_code: offers.coupon,
    phone: contact.phone,
    loyalty: offers.loyalty ? { token: offers.loyalty.token, points: offers.loyalty.points } : null,
  });
  const set = (k: keyof Contact, v: string) => setContact((c) => ({ ...c, [k]: v }));

  if (!ordering.enabled) {
    return (
      <Wrapper>
        <p>{t('order.notTaking')}</p>
      </Wrapper>
    );
  }
  if (lines.length === 0) {
    return (
      <Wrapper>
        <h1 className={`text-4xl ${skin.heading}`}>{t('order.checkoutTitle')}</h1>
        <p className="mt-3">{t('order.emptyText')}</p>
        <Link to="/menu" className={`mt-6 inline-flex min-h-12 items-center px-6 ${skin.primary}`}>
          {t('site.viewMenu')}
        </Link>
      </Wrapper>
    );
  }

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGeo({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (contact.name.trim().length < 2) e['customer.name'] = t('order.err.name');
    // At a table the phone number is optional (only for "your order is ready" messages).
    if ((!table || contact.phone) && !isIndianMobile(contact.phone)) e['customer.phone'] = t('order.err.phone');
    if (contact.email && !/^\S+@\S+\.\S+$/.test(contact.email)) e['customer.email'] = t('order.err.email');
    if (type === 'delivery') {
      if (contact.line1.trim().length < 3) e['address.line1'] = t('order.err.address');
      if (!/^[1-9]\d{5}$/.test(contact.pincode)) e['address.pincode'] = t('order.err.pincode');
    }
    if (when === 'later' && !(slot || day?.slots[0]?.value)) e.scheduled_for = t('order.err.slot');
    if (!method) e.payment_method = t('order.err.payment');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const place = async () => {
    setFormError('');
    if (!validate()) return;
    setPlacing(true);
    try {
      localStorage.setItem(CONTACT_KEY, JSON.stringify(contact));
    } catch {
      /* ignore */
    }
    try {
      const res = await request();
      const { order, token, razorpay } = res;
      rememberOrder(window.location.host, order.id, token, order.number);
      if (me && saveAddr && type === 'delivery' && !me.addresses.some(sameAddress)) {
        saveAddresses.mutate({ name: me.name ?? (contact.name.trim() || null), addresses: [...me.addresses, { label: null, line1: contact.line1.trim(), line2: contact.line2.trim() || null, landmark: contact.landmark.trim() || null, pincode: contact.pincode }].slice(-5) });
      }
      if (method === 'online' && razorpay) {
        await pay(order, token, razorpay);
      } else {
        clear();
        navigate(table ? '/table?placed=1' : `/order/${order.id}?t=${token}&placed=1`, { replace: true });
      }
    } catch (e) {
      const err = e as ApiError;
      if (err.errors) setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])));
      setFormError(err.message);
    } finally {
      setPlacing(false);
    }
  };

  const request = async () =>
    (
      await api.post<{ order: CustomerOrder; token: string; razorpay: Record<string, unknown> | null }>('/site/orders', {
        type,
        payment_method: method,
        scheduled_for: when === 'later' && !table ? slot || day?.slots[0]?.value : null,
        customer: { name: contact.name, phone: contact.phone || null, email: contact.email || null },
        table_token: table?.token ?? null,
        coupon_code: offers.coupon,
        loyalty: offers.loyalty?.points ? { token: offers.loyalty.token, points: offers.loyalty.points } : null,
        marketing_opt_in: optIn,
        address: type === 'delivery' ? { line1: contact.line1, line2: contact.line2 || null, landmark: contact.landmark || null, pincode: contact.pincode, lat: geo?.lat ?? null, lng: geo?.lng ?? null } : null,
        notes: notes || null,
        items: apiLines(lines),
      })
    ).data;

  const pay = async (order: CustomerOrder, token: string, rzp: Record<string, unknown>) => {
    await loadRazorpay();
    await new Promise<void>((resolve) => {
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
            await api.post(`/site/orders/${order.id}/payment`, { t: token, ...r });
          } catch {
            /* the webhook will still confirm it; the tracking page shows the current state */
          }
          clear();
          navigate(table ? '/table?placed=1' : `/order/${order.id}?t=${token}&placed=1`, { replace: true });
          resolve();
        },
        modal: {
          ondismiss: () => {
            setFormError(t('order.paymentCancelled'));
            resolve();
          },
        },
      });
      checkout.on('payment.failed', () => setFormError(t('order.paymentFailed')));
      checkout.open();
    });
  };

  const field = (key: keyof Contact, errorKey: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, optional = false) => (
    <label className="block">
      <span className="text-sm font-semibold">
        {label}
        {optional && <span className="font-normal text-t-muted"> ({t('order.optional')})</span>}
      </span>
      <input
        {...props}
        value={contact[key]}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={!!errors[errorKey]}
        aria-describedby={errors[errorKey] ? `err-${key}` : undefined}
        className={`mt-1 block min-h-12 w-full px-3 ${skin.input} aria-[invalid=true]:border-[#b91c1c]`}
      />
      {errors[errorKey] && (
        <span id={`err-${key}`} role="alert" className="mt-1 block text-sm font-semibold text-[#b91c1c]">
          {errors[errorKey]}
        </span>
      )}
    </label>
  );

  const q = quote.data;
  const minError = q?.zone_error;

  return (
    <Wrapper>
      <Link to={table ? '/table' : '/menu'} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('order.backToMenu')}
      </Link>
      <h1 className={`mt-2 text-4xl sm:text-5xl ${skin.heading}`}>{t('order.checkoutTitle')}</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className={`p-5 ${skin.card}`} aria-labelledby="how-h">
            <h2 id="how-h" className={`text-2xl ${skin.heading}`}>
              {t('order.howTitle')}
            </h2>
            <div className="mt-3">
              {table ? (
                <p className="font-semibold">{t('site.table.orderingFor', { label: table.label })}</p>
              ) : (
                <>
                  <OrderTypePicker site={site} value={type} onChange={setStoredType} />
                  {ordering.types.length === 1 && <p className="font-semibold">{t(`order.type.${type}`)}</p>}
                </>
              )}
            </div>
            {table ? (
              <p className="mt-3 text-sm text-t-muted">{t('site.table.servedHere')}</p>
            ) : (
            <fieldset className="mt-5 min-w-0">
              <legend className="text-sm font-semibold">{t('order.whenTitle')}</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className={`flex min-h-12 items-center gap-2 px-3 ${skin.chip} ${status && !status.is_open ? 'opacity-50' : ''}`}>
                  <input type="radio" name="when" checked={when === 'now'} disabled={!!status && !status.is_open} onChange={() => setWhen('now')} className="accent-[var(--t-primary)]" />
                  {t('order.asap')}
                </label>
                <label className={`flex min-h-12 items-center gap-2 px-3 ${skin.chip} ${!days.length ? 'opacity-50' : ''}`}>
                  <input type="radio" name="when" checked={when === 'later'} disabled={!days.length} onChange={() => setWhen('later')} className="accent-[var(--t-primary)]" />
                  {t('order.later')}
                </label>
              </div>
              {status && !status.is_open && <p className="mt-2 text-sm text-t-muted">{days.length ? t('order.closedSchedule') : t('order.closedNoSchedule')}</p>}
              {when === 'now' && status?.is_open && (
                <p className="mt-2 text-sm text-t-muted">{t(type === 'delivery' ? 'order.etaDelivery' : 'order.etaReady', { minutes: ordering.prep_minutes + (type === 'delivery' ? ordering.delivery_minutes : 0) })}</p>
              )}
              {when === 'later' && day && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <select aria-label={t('order.day')} className={`min-h-12 px-2 ${skin.input}`} value={day.date} onChange={(e) => { setSlotDay(e.target.value); setSlot(''); }}>
                    {days.map((d) => (
                      <option key={d.date} value={d.date}>
                        {new Intl.DateTimeFormat(intlLocale(i18n.language), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d.date}T12:00:00Z`))}
                      </option>
                    ))}
                  </select>
                  <select aria-label={t('order.time')} className={`min-h-12 px-2 ${skin.input}`} value={slot || day.slots[0]?.value} onChange={(e) => setSlot(e.target.value)} aria-invalid={!!errors.scheduled_for}>
                    {day.slots.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {errors.scheduled_for && (
                <p role="alert" className="mt-1 text-sm font-semibold text-[#b91c1c]">
                  {errors.scheduled_for}
                </p>
              )}
            </fieldset>
            )}
          </section>

          <section className={`space-y-4 p-5 ${skin.card}`} aria-labelledby="contact-h">
            <h2 id="contact-h" className={`text-2xl ${skin.heading}`}>
              {t('order.contactTitle')}
            </h2>
            {field('name', 'customer.name', t('order.name'), { autoComplete: 'name' })}
            <div className="grid gap-4 sm:grid-cols-2">
              {field('phone', 'customer.phone', t('order.phone'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel' }, !!table)}
              {field('email', 'customer.email', t('order.email'), { type: 'email', autoComplete: 'email' }, true)}
            </div>
            <p className="text-xs text-t-muted">{t('order.contactUse')}</p>
            {site.growth?.coupons && (
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--t-primary)]" />
                <span>{t('order.optIn', { name: site.name })}</span>
              </label>
            )}
          </section>

          {type === 'delivery' && (
            <section className={`space-y-4 p-5 ${skin.card}`} aria-labelledby="addr-h">
              <h2 id="addr-h" className={`text-2xl ${skin.heading}`}>
                {t('order.addressTitle')}
              </h2>
              {!!me?.addresses.length && (
                <div className="flex flex-wrap gap-2" role="group" aria-label={t('order.account.addresses')}>
                  {me.addresses.map((a, i) => (
                    <button key={`${a.line1}-${i}`} type="button" aria-pressed={sameAddress(a)} className={`inline-flex min-h-10 max-w-full items-center gap-2 px-3 text-sm ${skin.chip}`} onClick={() => setContact({ ...contact, line1: a.line1, line2: a.line2 ?? '', landmark: a.landmark ?? '', pincode: a.pincode })}>
                      <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{a.label ?? a.line1}</span>
                    </button>
                  ))}
                </div>
              )}
              {field('line1', 'address.line1', t('order.line1'), { autoComplete: 'address-line1' })}
              {field('line2', 'address.line2', t('order.line2'), { autoComplete: 'address-line2' }, true)}
              <div className="grid gap-4 sm:grid-cols-2">
                {field('landmark', 'address.landmark', t('order.landmark'), {}, true)}
                {field('pincode', 'address.pincode', t('order.pincode'), { inputMode: 'numeric', autoComplete: 'postal-code', maxLength: 6 })}
              </div>
              {me && contact.line1.trim().length >= 3 && !me.addresses.some(sameAddress) && (
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--t-primary)]" />
                  <span>{t('order.account.saveAddress')}</span>
                </label>
              )}
              <button type="button" onClick={locate} className={`inline-flex min-h-11 items-center gap-2 px-3 text-sm ${skin.secondary}`} disabled={locating}>
                {locating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Crosshair className="h-4 w-4" aria-hidden="true" />}
                {geo ? t('order.locationAdded') : t('order.useLocation')}
              </button>
              {q?.zone && !minError && <p className="text-sm font-semibold">{t('order.deliversTo', { zone: q.zone.name })}</p>}
              {minError && (
                <p role="alert" className="text-sm font-semibold text-[#b91c1c]">
                  {minError.message}
                </p>
              )}
            </section>
          )}

          <Offers site={site} phone={contact.phone} value={offers} onChange={setOffers} quote={quote.data} />

          <section className={`p-5 ${skin.card}`} aria-labelledby="pay-h">
            <h2 id="pay-h" className={`text-2xl ${skin.heading}`}>
              {t('order.paymentTitle')}
            </h2>
            {methods.length === 0 ? (
              <p className="mt-2">{t('order.noPayment')}</p>
            ) : (
              <div className="mt-3 grid gap-2" role="radiogroup" aria-labelledby="pay-h">
                {methods.map((m) => (
                  <label key={m} className={`flex min-h-12 cursor-pointer items-center gap-3 px-3 ${skin.chip}`}>
                    <input type="radio" name="payment" checked={method === m} onChange={() => setMethod(m)} className="accent-[var(--t-primary)]" />
                    <span>
                      <span className="block font-semibold">{t(`order.pay.${m}`)}</span>
                      <span className="block text-xs text-t-muted">{t(`order.payHint.${m}`)}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {errors.payment_method && (
              <p role="alert" className="mt-1 text-sm font-semibold text-[#b91c1c]">
                {errors.payment_method}
              </p>
            )}
            <label className="mt-5 block">
              <span className="text-sm font-semibold">
                {t('order.notesForKitchen')} <span className="font-normal text-t-muted">({t('order.optional')})</span>
              </span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} className={`mt-1 block w-full px-3 py-2 ${skin.input}`} />
            </label>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className={`p-5 ${skin.card}`}>
            <h2 className={`text-2xl ${skin.heading}`}>{t('order.summary', { count: cartCount(lines) })}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {(q?.lines ?? []).map((line, i) => {
                // The quote lists the cart's lines in order; the cart line has the names in every language.
                const own = lines[i]?.item_id === line.menu_item_id ? lines[i] : null;
                const extras = own ? lineExtras(own, i18n.language) : [line.variant_name, ...line.addons.map((a) => a.name)].filter(Boolean);
                return (
                  <li key={i} className="flex gap-2">
                    <FoodTypeMark type={line.food_type} className="mt-0.5" />
                    <span className="flex-1">
                      {line.quantity} × {l(own ?? line, 'name')}
                      {extras.length > 0 && <span className="block text-xs text-t-muted">{extras.join(' · ')}</span>}
                    </span>
                    <span className="tabular-nums">{money(Number(line.unit_price) * line.quantity)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4">{q ? <BillSummary quote={q} deliveryPending={type === 'delivery' && !q.zone} /> : quote.isLoading && <p className="text-sm">{t('common.loading')}</p>}</div>
            {quote.isError && (
              <p role="alert" className="mt-2 text-sm font-semibold text-[#b91c1c]">
                {(quote.error as Error).message}
              </p>
            )}
            {formError && (
              <p role="alert" className="mt-3 rounded bg-[#fee2e2] px-3 py-2 text-sm font-semibold text-[#991b1b]">
                {formError}
              </p>
            )}
            <button type="button" onClick={() => void place()} disabled={placing || quote.isError || !!minError || !!quote.data?.offer_error || methods.length === 0} className={`mt-4 flex min-h-14 w-full items-center justify-center gap-2 px-4 text-lg disabled:opacity-50 ${skin.primary}`}>
              {placing && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
              {method === 'online' ? t('order.payAndPlace', { amount: q ? money(q.total) : '' }) : t('order.place')}
            </button>
            <p className="mt-3 text-xs text-t-muted">{t('order.serverPriced')}</p>
          </div>
        </aside>
      </div>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">{children}</div>;
}
