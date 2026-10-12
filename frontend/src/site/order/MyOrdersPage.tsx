import { Link } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, LogOut, MapPin, ReceiptText, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { useLocalized } from '../data';
import { recentOrders, useMoney } from '../ordering';
import { guestSignOut, useGuestAccount, useGuestUpdate } from '../account';
import type { CustomerOrder, SiteData } from '../types';
import { GuestSignIn } from './GuestSignIn';
import { OrderAgain } from './OrderAgain';
import { useSkin } from './skin';

/**
 * Orders placed from this phone or browser, plus (once signed in with the phone number)
 * orders from any device, saved addresses and loyalty points. Order again on each.
 */
export default function MyOrdersPage({ site }: { site: SiteData }) {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const skin = useSkin();
  const money = useMoney();
  const account = useGuestAccount();
  const update = useGuestUpdate();
  const me = account.data;
  // This device's orders and the account's, newest first, each once.
  const local = recentOrders(window.location.host);
  const saved = [...(me?.orders ?? []).map((o) => ({ id: o.id, token: o.token, number: o.number })), ...local]
    .filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i)
    .sort((a, b) => b.number - a.number)
    .slice(0, 20);
  const results = useQueries({
    queries: saved.map((o) => ({
      queryKey: ['order', o.id, o.token],
      queryFn: async () => (await api.get<CustomerOrder>(`/site/orders/${o.id}`, { t: o.token })).data,
      retry: false,
      staleTime: 30_000,
    })),
  });
  const date = (iso: string) => new Intl.DateTimeFormat(i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN', { timeZone: site.timezone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className={`text-4xl sm:text-5xl ${skin.heading}`}>{t('order.mine.title')}</h1>
      <p className="mt-2 text-t-muted">{me ? t('order.account.leadSignedIn') : t('order.mine.lead')}</p>

      {me ? (
        <section className={`mt-6 p-5 ${skin.card}`} aria-labelledby="acct-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="acct-h" className="text-lg font-bold">
                {me.name ?? t('order.account.signedIn')}
              </h2>
              <p className="text-sm text-t-muted">
                {formatPhone(me.phone)}
                {site.growth?.loyalty?.enabled && ` · ${t('order.account.points', { count: me.points })}`}
              </p>
            </div>
            <button type="button" className="inline-flex min-h-11 items-center gap-2 px-3 text-sm font-semibold underline" onClick={() => void guestSignOut()}>
              <LogOut className="h-4 w-4" aria-hidden="true" /> {t('order.account.signOut')}
            </button>
          </div>
          {me.addresses.length > 0 && (
            <div className="mt-4 border-t border-t-line pt-4">
              <h3 className="font-semibold">{t('order.account.addresses')}</h3>
              <ul className="mt-2 space-y-2">
                {me.addresses.map((a, i) => (
                  <li key={`${a.line1}-${i}`} className="flex items-start gap-3 text-sm">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1">{[a.label, a.line1, a.line2, a.landmark, a.pincode].filter(Boolean).join(', ')}</span>
                    <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5" aria-label={t('order.account.removeAddress')} disabled={update.isPending} onClick={() => update.mutate({ name: me.name, addresses: me.addresses.filter((_, j) => j !== i) })}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <section className={`mt-6 p-5 ${skin.card}`} aria-labelledby="signin-h">
          <h2 id="signin-h" className="text-lg font-bold">
            {t('order.account.title')}
          </h2>
          <p className="mb-4 text-sm text-t-muted">{t('order.account.why')}</p>
          <GuestSignIn />
        </section>
      )}

      {!saved.length && (
        <div className={`mt-6 flex flex-col items-center gap-4 p-8 text-center ${skin.card}`}>
          <ReceiptText className="h-8 w-8 text-t-muted" aria-hidden="true" />
          <p>{me ? t('order.account.noOrders') : t('order.mine.empty')}</p>
          {site.has_menu && (
            <Link to="/menu" className={`inline-flex min-h-12 items-center px-6 ${skin.primary}`}>
              {site.ordering.enabled ? t('site.hero.order') : t('site.viewMenu')}
            </Link>
          )}
        </div>
      )}

      <ul className="mt-6 space-y-4">
        {saved.map((o, i) => {
          const q = results[i];
          const order = q.data;
          // Orders the restaurant has since removed (or links that expired) are left out quietly.
          if (q.isError) return null;
          return (
            <li key={o.id} className={`p-5 ${skin.card}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{t('order.orderNumber', { number: o.number })}</p>
                  <p className="text-sm text-t-muted">{order ? `${date(order.placed_at)} · ${t(`order.type.${order.type}`)}` : t('common.loading')}</p>
                </div>
                {order && (
                  <div className="text-right">
                    <p className="font-bold tabular-nums">{money(Number(order.total))}</p>
                    <p className="text-sm font-semibold">{t(`order.status.${order.status}`)}</p>
                  </div>
                )}
              </div>
              {order && <p className="mt-3 text-sm text-t-muted">{order.items.map((it) => `${it.quantity} × ${l(it, 'name')}`).join(', ')}</p>}
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Link to={`/order/${o.id}?t=${encodeURIComponent(o.token)}`} className="s-btn s-btn-secondary w-full">
                  {t('order.mine.track')}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                {order && <OrderAgain site={site} order={order} />}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
