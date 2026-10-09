import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { OrderSkin } from '@/themes/types';

const fallback: OrderSkin = {
  heading: 'font-display text-t-text',
  primary: 'rounded-t bg-t-primary font-semibold text-t-on-primary',
  secondary: 'rounded-t border border-t-line bg-t-surface font-semibold text-t-text',
  card: 'rounded-t border border-t-line bg-t-surface',
  input: 'rounded-t border border-t-line bg-t-surface text-t-text',
  chip: 'rounded-t border border-t-line bg-t-surface',
};

export const SkinContext = createContext<OrderSkin>(fallback);
export const useSkin = () => useContext(SkinContext);

/** Accessible modal / side sheet used by the dish options, cart and confirmations. */
export function SiteDialog({
  open,
  onClose,
  title,
  children,
  side = false,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: boolean;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const skin = useSkin();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const el = panel.current;
    el?.querySelector<HTMLElement>('[data-autofocus]')?.focus() ?? el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && el) {
        // Keep focus inside the dialog.
        const f = el.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="site-dialog fixed inset-0 z-[85] flex items-end justify-center sm:items-center" style={side ? { justifyContent: 'flex-end', alignItems: 'stretch' } : undefined}>
      <button type="button" aria-label={t('common.close')} tabIndex={-1} className="absolute inset-0 cursor-default bg-black/50" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden text-t-text outline-none ${skin.card} ${side ? '!max-h-none h-full sm:max-w-md' : 'sm:max-w-lg'}`}
        style={{ background: 'var(--t-bg)' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-t-line px-5 py-3">
          <h2 className={`text-2xl leading-tight ${skin.heading}`}>{title}</h2>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-black/5" aria-label={t('common.close')}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-t-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.querySelector('.site-root') ?? document.body,
  );
}
