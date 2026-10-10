import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BellRing, CheckCircle2, Loader2, LogOut, ReceiptText, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { cartCount, cartEstimate, useCart } from '../cart';
import { telHref, useLocalized } from '../data';
import { FoodTypeMark } from '../components/bits';
import { useMoney } from '../ordering';
import { useActiveTable, useTable, useTableView, type TableView } from '../table';
import type { SiteData } from '../types';
import { PageHeader } from './pages';

/** /t/{token}: a guest scanned a table's QR code. Remember the table and open the menu. */
export function TableLanding({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const join = useTable((s) => s.join);
  const setType = useCart((s) => s.setType);
  const view = useTableView(site.features.qr_ordering ? token : null);

  useEffect(() => {
    if (!view.data) return;
    join(token, view.data.label);
    setType('dine_in');
    navigate(site.has_menu ? '/menu' : '/table', { replace: true });
  }, [view.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (view.isError || !site.features.qr_ordering) {
    return (
      <>
        <PageHeader site={site} eyebrow={site.name} title={t('site.table.badQr')} lead={t('site.table.badQrText')} />
        <div className="s-wrap flex flex-wrap gap-3 pb-20">
          {site.has_menu && (
            <Link to="/menu" className="s-btn s-btn-primary">
              {t('site.viewMenu')}
            </Link>
          )}
          {site.content.contact.phone && (
            <a href={telHref(site.content.contact.phone)} className="s-btn s-btn-secondary">
              {t('site.call')}
            </a>
          )}
        </div>
      </>
    );
  }
  return (
    <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true">
      <Loader2 className="h-8 w-8 animate-spin opacity-60" aria-label={t('common.loading')} />
    </div>
  );
}

/** Call waiter / request bill, with a short confirmation. */
function useTableRequest(token: string) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<'waiter' | 'bill' | null>(null);
  const [message, setMessage] = useState('');
  const send = async (type: 'waiter' | 'bill') => {
    setBusy(type);
    setMessage('');
    try {
      const res = await api.post<TableView>(`/site/tables/${token}/requests`, { type });
      qc.setQueryData(['site', 'table', token], res.data);
      setMessage(type === 'bill' ? t('site.table.billAsked') : t('site.table.waiterAsked'));
    } catch (e) {
      setMessage((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };
  return { send, busy, message };
}

/** The table's running order: every guest's orders, their status, and the bill so far. */
export function TablePage({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const money = useMoney();
  const [params] = useSearchParams();
  const table = useActiveTable(site);
  const leave = useTable((s) => s.leave);
  const view = useTableView(table?.token);
  const req = useTableRequest(table?.token ?? '');
  const navigate = useNavigate();

  if (!table) return <Navigate to="/" replace />;
  const session = view.data?.session;
  const open = view.data?.open_requests ?? [];

  return (
    <>
      <PageHeader
        site={site}
        eyebrow={site.name}
        title={t('site.table.title', { label: table.label })}
        lead={params.get('placed') ? <span className="inline-flex items-center gap-2 font-semibold text-t-text"><CheckCircle2 className="h-5 w-5 text-[#1f8a4c]" aria-hidden="true" />{t('site.table.placed')}</span> : t('site.table.lead')}
      />
      <div className="s-wrap s-grid gap-y-8 pb-24">
        <div className="col-span-4 space-y-4 md:col-span-7">
          {view.isLoading && <div className="s-card h-40 animate-pulse" />}
          {view.isError && <p className="s-card p-5 font-semibold">{(view.error as Error).message}</p>}
          {view.data && !session?.orders.length && (
            <div className="s-card p-6">
              <p className="s-h3">{t('site.table.nothingYet')}</p>
              <p className="s-muted mt-2">{t('site.table.nothingYetText')}</p>
            </div>
          )}
          {session?.orders.map((o) => (
            <article key={o.number} className="s-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-bold">{t('order.orderNumber', { number: o.number })}</h2>
                <p className={`s-status ${o.status === 'ready' || o.status === 'completed' ? 'is-open' : ''}`}>
                  <span className="s-status-dot" aria-hidden="true" />
                  {t(`order.status.${o.status}`)}
                </p>
              </div>
              <ul className="mt-3 divide-y divide-t-line">
                {o.items.map((i, n) => (
                  <li key={n} className="flex gap-3 py-2 text-sm">
                    <FoodTypeMark type={i.food_type} className="mt-0.5" />
                    <span className="flex-1">
                      {i.quantity} × {l(i, 'name')}
                      {(i.variant_name || i.addons.length > 0) && <span className="s-muted block text-xs">{[i.variant_name, ...i.addons.map((a) => a.name)].filter(Boolean).join(' · ')}</span>}
                    </span>
                    <span className="tabular-nums">{money(Number(i.unit_price) * i.quantity)}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <aside className="col-span-4 md:col-span-5">
          <div className="s-card space-y-4 p-5 sm:p-6 md:sticky md:top-[calc(var(--s-header-h)+24px)]">
            {session && (
              <dl className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <dt>{session.totals.prices_include_tax ? t('order.itemsInclGst') : t('order.itemTotal')}</dt>
                  <dd className="tabular-nums">{money(session.totals.subtotal)}</dd>
                </div>
                {Number(session.totals.tax_total) > 0 && (
                  <div className="flex justify-between text-sm">
                    <dt>{session.totals.prices_include_tax ? t('order.gstIncluded') : t('order.gst')}</dt>
                    <dd className="tabular-nums">{money(session.totals.tax_total)}</dd>
                  </div>
                )}
                {Number(session.totals.packaging_fee) > 0 && (
                  <div className="flex justify-between text-sm">
                    <dt>{t('order.packaging')}</dt>
                    <dd className="tabular-nums">{money(session.totals.packaging_fee)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-t-line pt-2 text-lg font-bold">
                  <dt>{t('site.table.billSoFar')}</dt>
                  <dd className="tabular-nums">{money(session.totals.total)}</dd>
                </div>
                {Number(session.totals.paid) > 0 && (
                  <div className="flex justify-between text-sm">
                    <dt>{t('site.table.paidOnline')}</dt>
                    <dd className="tabular-nums">{money(session.totals.paid)}</dd>
                  </div>
                )}
              </dl>
            )}
            <div className="grid gap-2">
              {site.ordering.enabled && site.ordering.types.includes('dine_in') && (
                <Link to="/menu" className="s-btn s-btn-primary">
                  <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
                  {session?.orders.length ? t('site.table.orderMore') : t('site.table.startOrder')}
                </Link>
              )}
              <button type="button" className="s-btn s-btn-secondary" disabled={!!req.busy} onClick={() => void req.send('waiter')} aria-pressed={open.includes('waiter')}>
                {req.busy === 'waiter' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
                {open.includes('waiter') ? t('site.table.waiterComing') : t('site.table.callWaiter')}
              </button>
              <button type="button" className="s-btn s-btn-secondary" disabled={!!req.busy || !session} onClick={() => void req.send('bill')} aria-pressed={!!session?.bill_requested}>
                {req.busy === 'bill' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ReceiptText className="h-4 w-4" aria-hidden="true" />}
                {session?.bill_requested ? t('site.table.billComing') : t('site.table.requestBill')}
              </button>
            </div>
            <p className="s-small min-h-5 font-semibold" role="status">
              {req.message}
            </p>
            <p className="s-small s-muted">{t('site.table.payNote')}</p>
            <button
              type="button"
              className="s-small inline-flex min-h-10 items-center gap-2 font-semibold underline"
              onClick={() => {
                leave();
                navigate('/', { replace: true });
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {t('site.table.leave')}
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

/** Bottom bar while ordering at a table: the table, call waiter, and the cart / table order. */
export function TableBar({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const money = useMoney();
  const { pathname } = useLocation();
  const table = useActiveTable(site);
  const lines = useCart((s) => s.lines);
  const setOpen = useCart((s) => s.setOpen);
  const req = useTableRequest(table?.token ?? '');
  if (!table || pathname.startsWith('/checkout') || pathname.startsWith('/t/')) return null;
  const count = cartCount(lines);

  return (
    <nav className="s-bar s-table-bar" aria-label={t('site.table.barLabel', { label: table.label })}>
      <Link to="/table" aria-current={pathname === '/table' ? 'page' : undefined}>
        <span className="truncate">{t('site.table.short', { label: table.label })}</span>
      </Link>
      <button type="button" onClick={() => void req.send('waiter')} disabled={!!req.busy}>
        {req.busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <BellRing className="h-[18px] w-[18px]" aria-hidden="true" />}
        {t('site.table.waiter')}
      </button>
      {count > 0 ? (
        <button type="button" className="is-main" onClick={() => setOpen(true)} aria-label={t('order.viewCart', { count })}>
          <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="tabular-nums">
            {count} · {money(cartEstimate(lines))}
          </span>
        </button>
      ) : (
        <Link to={pathname === '/menu' ? '/table' : '/menu'} className="is-main">
          {pathname === '/menu' ? <ReceiptText className="h-[18px] w-[18px]" aria-hidden="true" /> : <UtensilsCrossed className="h-[18px] w-[18px]" aria-hidden="true" />}
          {pathname === '/menu' ? t('site.table.myOrder') : t('site.bar.menu')}
        </Link>
      )}
      <span className="sr-only" role="status">
        {req.message}
      </span>
    </nav>
  );
}
