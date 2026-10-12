import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { useCart } from '../cart';
import { useSiteMenu } from '../data';
import type { CustomerOrder, SiteData } from '../types';
import { reorderLines } from './reorder';

/** Puts a past delivery / takeaway order back in the cart at today's prices and opens it. */
export function OrderAgain({ site, order, className = '' }: { site: SiteData; order: Pick<CustomerOrder, 'type' | 'items'>; className?: string }) {
  const { t } = useTranslation();
  const { data: menu } = useSiteMenu();
  const add = useCart((s) => s.add);
  const setOpen = useCart((s) => s.setOpen);
  const [note, setNote] = useState('');
  if (!site.ordering.enabled || (order.type !== 'delivery' && order.type !== 'takeaway')) return null;

  const run = () => {
    if (!menu) return;
    const { lines, missing } = reorderLines(order, menu);
    lines.forEach(add);
    setNote(
      !lines.length
        ? t('order.again.none')
        : missing.length
          ? t('order.again.some', { list: missing.join(', ') })
          : '',
    );
    if (lines.length) setOpen(true);
  };

  return (
    <div className={className}>
      <button type="button" className="s-btn s-btn-secondary w-full" onClick={run} disabled={!menu}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {t('order.again.button')}
      </button>
      <p role="status" className="s-small s-muted mt-2 empty:hidden">
        {note}
      </p>
    </div>
  );
}
