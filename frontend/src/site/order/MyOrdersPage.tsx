import { Link } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ReceiptText } from 'lucide-react';
import { api } from '@/lib/api';
import { useLocalized } from '../data';
import { recentOrders, useMoney } from '../ordering';
import type { CustomerOrder, SiteData } from '../types';
import { OrderAgain } from './OrderAgain';
import { useSkin } from './skin';

/**
 * Orders placed from this phone or browser (no account needed): status, total, what was in
 * it, a link to track it and "Order again". Kept on the device only, like the cart.
 */
export default function MyOrdersPage({ site }: { site: SiteData }) {
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const skin = useSkin();
  const money = useMoney();
  const saved = recentOrders(window.location.host);
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
      <p className="mt-2 text-t-muted">{t('order.mine.lead')}</p>

      {!saved.length && (
        <div className={`mt-8 flex flex-col items-center gap-4 p-8 text-center ${skin.card}`}>
          <ReceiptText className="h-8 w-8 text-t-muted" aria-hidden="true" />
          <p>{t('order.mine.empty')}</p>
          {site.has_menu && (
            <Link to="/menu" className={`inline-flex min-h-12 items-center px-6 ${skin.primary}`}>
              {site.ordering.enabled ? t('site.hero.order') : t('site.viewMenu')}
            </Link>
          )}
        </div>
      )}

      <ul className="mt-8 space-y-4">
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
              {order && (
                <p className="mt-3 text-sm text-t-muted">
                  {order.items.map((it) => `${it.quantity} × ${l(it, 'name')}`).join(', ')}
                </p>
              )}
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
