import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { cartCount, cartEstimate, MAX_QTY, useCart } from '../cart';
import { useLocalized, useOpenStatus, useSite } from '../data';
import { FoodTypeMark } from '../components/bits';
import { useMoney, useQuote } from '../ordering';
import type { OrderType, Quote, SiteData } from '../types';
import { SiteDialog, useSkin } from './skin';
import { useActiveTable } from '../table';
import { useActiveRoom } from '../hotel';

export function OrderTypePicker({ site, value, onChange }: { site: SiteData; value: OrderType | null; onChange: (t: OrderType) => void }) {
  const { t } = useTranslation();
  const skin = useSkin();
  const types = site.ordering.types;
  if (types.length < 2) return null;
  return (
    <div className="grid grid-flow-col gap-2" role="radiogroup" aria-label={t('order.howTitle')}>
      {types.map((type) => (
        <button key={type} type="button" role="radio" aria-checked={value === type} onClick={() => onChange(type)} className={`min-h-11 px-3 text-sm font-semibold ${skin.chip} aria-checked:!bg-t-primary aria-checked:!text-t-on-primary`}>
          {t(`order.type.${type}`)}
        </button>
      ))}
    </div>
  );
}

/** Bill lines; the same breakdown is used in the cart, at checkout and on the tracking page. */
export function BillSummary({ quote, showDeliveryHint = false, deliveryPending = false }: { quote: Pick<Quote, 'subtotal' | 'tax_total' | 'packaging_fee' | 'delivery_fee' | 'total' | 'prices_include_tax'> & { discount_total?: string | null; discount_label?: string | null }; showDeliveryHint?: boolean; deliveryPending?: boolean }) {
  const { t } = useTranslation();
  const money = useMoney();
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-4 ${strong ? 'border-t border-t-line pt-2 text-lg font-bold' : 'text-sm'}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
  return (
    <dl className="space-y-1.5">
      {/* Items before the discount, then the discount (coupon / points), then GST on what is left. */}
      {row(quote.prices_include_tax ? t('order.itemsInclGst') : t('order.itemTotal'), money(Number(quote.subtotal) + Number(quote.discount_total ?? 0)))}
      {quote.discount_total && Number(quote.discount_total) > 0 && row(quote.discount_label ? `${t('order.discount')} (${quote.discount_label})` : t('order.discount'), `− ${money(quote.discount_total)}`)}
      {Number(quote.tax_total) > 0 && row(quote.prices_include_tax ? t('order.gstIncluded') : t('order.gst'), money(quote.tax_total))}
      {Number(quote.packaging_fee) > 0 && row(t('order.packaging'), money(quote.packaging_fee))}
      {deliveryPending ? row(t('order.delivery'), t('order.deliveryAtCheckout')) : Number(quote.delivery_fee) > 0 ? row(t('order.delivery'), money(quote.delivery_fee)) : showDeliveryHint && row(t('order.delivery'), t('order.free'))}
      {row(t('order.total'), money(quote.total), true)}
    </dl>
  );
}

function CartLines() {
  const { t } = useTranslation();
  const l = useLocalized();
  const money = useMoney();
  const skin = useSkin();
  const lines = useCart((s) => s.lines);
  const setQuantity = useCart((s) => s.setQuantity);
  return (
    <ul className="divide-y divide-t-line">
      {lines.map((line) => (
        <li key={line.key} className="flex gap-3 py-3">
          {line.image ? <img src={line.image} alt="" className="h-16 w-16 shrink-0 rounded-[inherit] object-cover" /> : null}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-semibold">
              <FoodTypeMark type={line.food_type} />
              <span className="truncate">{l(line, 'name')}</span>
            </p>
            {(line.variant_name || line.addon_names.length > 0) && <p className="text-sm text-t-muted">{[line.variant_name, ...line.addon_names].filter(Boolean).join(' · ')}</p>}
            {line.notes && <p className="text-sm italic text-t-muted">“{line.notes}”</p>}
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className={`inline-flex items-center ${skin.chip}`} role="group" aria-label={t('order.quantityOf', { name: l(line, 'name') })}>
                <button type="button" className="flex h-9 w-9 items-center justify-center" onClick={() => setQuantity(line.key, line.quantity - 1)} aria-label={line.quantity === 1 ? t('order.removeNamed', { name: l(line, 'name') }) : t('order.decrease', { name: l(line, 'name') })}>
                  {line.quantity === 1 ? <Trash2 className="h-4 w-4" aria-hidden="true" /> : <Minus className="h-4 w-4" aria-hidden="true" />}
                </button>
                <span className="min-w-6 text-center font-bold tabular-nums">{line.quantity}</span>
                <button type="button" className="flex h-9 w-9 items-center justify-center disabled:opacity-40" disabled={line.quantity >= MAX_QTY} onClick={() => setQuantity(line.key, line.quantity + 1)} aria-label={t('order.increase', { name: l(line, 'name') })}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <span className="font-semibold tabular-nums">{money(line.unit_price * line.quantity)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Floating cart button on wider screens (phones use the bottom bar), hidden while empty and on checkout / tracking pages, + the cart sheet. */
export function Cart() {
  const { t } = useTranslation();
  const skin = useSkin();
  const money = useMoney();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: site } = useSite();
  const lines = useCart((s) => s.lines);
  const open = useCart((s) => s.open);
  const setOpen = useCart((s) => s.setOpen);
  const type = useCart((s) => s.type);
  const setType = useCart((s) => s.setType);
  const tick = useCart((s) => s.addedTick);
  const status = useOpenStatus(site!);
  const button = useRef<HTMLButtonElement>(null);
  const table = useActiveTable(site);
  const room = useActiveRoom(site);
  // At a table, orders are always dine-in for that table; in a hotel room, room service.
  const effectiveType = room ? 'room_service' : table && site?.ordering.types.includes('dine_in') ? 'dine_in' : type && site?.ordering.types.includes(type) ? type : (site?.ordering.types[0] ?? null);
  const quote = useQuote(open ? effectiveType : null);

  // A little nudge whenever something is added (no motion when reduced).
  useEffect(() => {
    if (!tick || !button.current || document.querySelector('[data-reduce-motion]')) return;
    button.current.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'cubic-bezier(0.34,1.56,0.64,1)' });
  }, [tick]);

  if (!site || (!site.ordering.enabled && !room)) return null;
  const count = cartCount(lines);
  const hidden = pathname.startsWith('/checkout') || pathname.startsWith('/order/') || !!table || !!room;

  return (
    <>
      {count > 0 && !hidden && (
        <button
          ref={button}
          type="button"
          onClick={() => setOpen(true)}
          className={`fixed bottom-6 right-6 z-50 hidden min-h-14 items-center gap-3 px-5 shadow-xl md:flex ${skin.primary}`}
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
          aria-label={t('order.viewCart', { count })}
        >
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          <span className="tabular-nums">{t('order.itemsCount', { count })}</span>
          <span className="opacity-60" aria-hidden="true">
            |
          </span>
          <span className="tabular-nums">{money(cartEstimate(lines))}</span>
        </button>
      )}

      <SiteDialog
        open={open}
        side
        onClose={() => setOpen(false)}
        title={t('order.yourOrder')}
        footer={
          lines.length > 0 && (
            <div className="space-y-3">
              {quote.data && <BillSummary quote={quote.data} deliveryPending={effectiveType === 'delivery'} />}
              {quote.isError && (
                <p role="alert" className="text-sm font-semibold text-[#b91c1c]">
                  {(quote.error as Error).message}
                </p>
              )}
              <button
                type="button"
                data-autofocus
                disabled={quote.isError}
                className={`min-h-12 w-full px-4 disabled:opacity-50 ${skin.primary}`}
                onClick={() => {
                  setOpen(false);
                  navigate('/checkout');
                }}
              >
                {t('order.checkout')}
              </button>
            </div>
          )
        }
      >
        {lines.length === 0 ? (
          <div className="py-10 text-center">
            <ShoppingBag className="mx-auto h-10 w-10 opacity-40" aria-hidden="true" />
            <p className="mt-3 font-semibold">{t('order.emptyTitle')}</p>
            <p className="text-sm text-t-muted">{t('order.emptyText')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {table ? <p className="font-semibold">{t('site.table.orderingFor', { label: table.label })}</p> : <OrderTypePicker site={site} value={effectiveType} onChange={setType} />}
            {status && !status.is_open && (
              <p className={`px-3 py-2 text-sm ${skin.card}`}>{site.ordering.scheduling.enabled ? t('order.closedSchedule') : t('order.closedNoSchedule')}</p>
            )}
            <CartLines />
          </div>
        )}
      </SiteDialog>
    </>
  );
}
