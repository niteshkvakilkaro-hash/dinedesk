import { useParams, useSearchParams, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Check, ChefHat, CircleCheckBig, Clock, PackageCheck, Phone, ReceiptText, Bike, XCircle } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { telHref, useLocalized } from '../data';
import { FoodTypeMark } from '../components/bits';
import { STATUS_FLOW, useMoney, useNow, useTrackedOrder } from '../ordering';
import { orderEstimate } from './eta';
import { OrderAgain } from './OrderAgain';
import { FeedbackForm } from '../ui/Growth';
import type { OrderStatus, SiteData } from '../types';
import { BillSummary } from './Cart';
import { useSkin } from './skin';

const ICONS: Record<OrderStatus, typeof Check> = {
  pending: ReceiptText,
  confirmed: CircleCheckBig,
  preparing: ChefHat,
  ready: PackageCheck,
  out_for_delivery: Bike,
  completed: Check,
  cancelled: XCircle,
};

export default function TrackPage({ site }: { site: SiteData }) {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const skin = useSkin();
  const money = useMoney();
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const justPlaced = params.get('placed') === '1';
  const { data: order, isLoading, error } = useTrackedOrder(id, token);
  const now = useNow();
  const time = (iso: string) => new Intl.DateTimeFormat(i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN', { timeZone: site.timezone, hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(iso));

  if (isLoading) return <Wrap><p>{t('common.loading')}</p></Wrap>;
  if (error || !order) {
    return (
      <Wrap>
        <h1 className={`text-4xl ${skin.heading}`}>{t('order.notFoundTitle')}</h1>
        <p className="mt-2">{error instanceof ApiError && error.status !== 404 ? error.message : t('order.notFoundText')}</p>
        <Link to="/menu" className={`mt-6 inline-flex min-h-12 items-center px-6 ${skin.primary}`}>{t('site.viewMenu')}</Link>
      </Wrap>
    );
  }

  const flow = STATUS_FLOW[order.type];
  const cancelled = order.status === 'cancelled';
  const reachedAt = (s: OrderStatus) => order.timeline.find((e) => e.status === s)?.at;
  const currentIndex = flow.indexOf(order.status);
  const awaitingPayment = order.payment_method === 'online' && order.payment_status !== 'paid' && !cancelled;
  const phone = site.content.contact.phone;
  const eta = orderEstimate(order, site.ordering.prep_minutes, site.ordering.delivery_minutes, now);
  const clock = (d: Date) => new Intl.DateTimeFormat(i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN', { timeZone: site.timezone, hour: 'numeric', minute: '2-digit' }).format(d);

  return (
    <Wrap>
      <div aria-live="polite">
        {justPlaced && !cancelled && <p className={`mb-4 px-4 py-3 font-semibold ${skin.card}`}>{t('order.thanks', { name: order.customer_name.split(' ')[0] })}</p>}
        <p className="text-sm font-semibold uppercase tracking-wider text-t-muted">{t(`order.type.${order.type}`)}</p>
        <h1 className={`text-4xl sm:text-5xl ${skin.heading}`}>{t('order.orderNumber', { number: order.number })}</h1>
        <p className="mt-2 text-lg font-semibold">
          {cancelled ? t('order.status.cancelled') : awaitingPayment ? (order.payment_status === 'failed' ? t('order.paymentFailedShort') : t('order.awaitingPayment')) : t(`order.statusLong.${order.status}`)}
        </p>
        {order.scheduled_for && !cancelled && <p className="mt-1 flex items-center gap-2 text-t-muted"><Clock className="h-4 w-4" aria-hidden="true" />{t('order.scheduledFor', { time: time(order.scheduled_for) })}</p>}
        {eta && (
          <p className={`mt-3 inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold ${skin.card}`}>
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            {eta.late ? t('order.eta.late') : t(eta.kind === 'arrive' ? 'order.eta.arrive' : 'order.eta.ready', { time: clock(eta.at) })}
          </p>
        )}
        {cancelled && order.cancel_reason && <p className="mt-1 text-t-muted">{t('order.reason', { reason: order.cancel_reason })}</p>}
        {order.payment_status === 'refund_due' && <p className="mt-1 text-t-muted">{t('order.refundDue')}</p>}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section className={`p-5 ${skin.card}`} aria-labelledby="progress-h">
          <h2 id="progress-h" className={`text-2xl ${skin.heading}`}>{t('order.progress')}</h2>
          <ol className="mt-5">
            {(cancelled ? [...order.timeline.map((e) => e.status)] : flow).map((s, i, arr) => {
              const at = reachedAt(s);
              const done = cancelled ? true : i <= currentIndex;
              const current = !cancelled && i === currentIndex;
              const Icon = ICONS[s];
              return (
                <li key={`${s}-${i}`} className="relative flex gap-4 pb-6 last:pb-0" aria-current={current ? 'step' : undefined}>
                  {i < arr.length - 1 && <span className={`absolute left-5 top-11 h-[calc(100%-2.75rem)] w-0.5 ${done && i < currentIndex ? 'bg-t-primary' : 'bg-t-line'}`} aria-hidden="true" />}
                  <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${done ? 'bg-t-primary text-t-on-primary' : 'border-2 border-t-line text-t-muted'} ${current ? 'ring-4 ring-[color-mix(in_srgb,var(--t-primary)_25%,transparent)]' : ''}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="pt-2">
                    <span className={`block font-semibold ${done ? '' : 'text-t-muted'}`}>{t(`order.status.${s}`)}</span>
                    {at && <span className="block text-sm text-t-muted">{time(at)}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-6 text-xs text-t-muted">{t('order.liveHint')}</p>
        </section>

        <aside className={`p-5 ${skin.card} lg:self-start`}>
          <h2 className={`text-2xl ${skin.heading}`}>{t('order.items')}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {order.items.map((it, i) => (
              <li key={i} className="flex gap-2">
                <FoodTypeMark type={it.food_type} className="mt-0.5" />
                <span className="flex-1">
                  {it.quantity} × {l(it, 'name')}
                  {(it.variant_name || it.addons.length > 0) && <span className="block text-xs text-t-muted">{[it.variant_name, ...it.addons.map((a) => a.name)].filter(Boolean).join(' · ')}</span>}
                  {it.notes && <span className="block text-xs italic text-t-muted">“{it.notes}”</span>}
                </span>
                <span className="tabular-nums">{money(Number(it.unit_price) * it.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4"><BillSummary quote={order} /></div>
          <p className="mt-3 text-sm">{t(`order.pay.${order.payment_method}`)} · {t(`order.paymentStatus.${order.payment_status}`)}</p>
          {order.address && (
            <p className="mt-3 text-sm text-t-muted">
              {[order.address.line1, order.address.line2, order.address.landmark, order.address.pincode].filter(Boolean).join(', ')}
            </p>
          )}
          {phone && (
            <a href={telHref(phone)} className={`mt-4 flex min-h-12 items-center justify-center gap-2 ${skin.secondary}`}>
              <Phone className="h-4 w-4" aria-hidden="true" /> {t('order.callRestaurant')}
            </a>
          )}
          {(order.status === 'completed' || cancelled) && <OrderAgain site={site} order={order} className="mt-2" />}
          <Link to="/menu" className={`mt-2 flex min-h-12 items-center justify-center ${skin.primary}`}>{t('order.orderMore')}</Link>
          {order.status === 'completed' && (
            <div className="mt-4">
              <FeedbackForm orderId={order.id} token={token} site={site} />
            </div>
          )}
        </aside>
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">{children}</div>;
}
