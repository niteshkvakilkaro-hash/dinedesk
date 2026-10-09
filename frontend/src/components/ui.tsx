import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Inbox, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';

// ---------- Form field: label + control + hint/error, aria wired once ----------

export function Field({
  label,
  error,
  hint,
  optional,
  children,
  className = '',
}: {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: (a: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">({t('common.optional')})</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5', label }: { className?: string; label?: string }) {
  const { t } = useTranslation();
  return (
    <span role="status" className="inline-flex items-center">
      <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />
      <span className="sr-only">{label ?? t('common.loading')}</span>
    </span>
  );
}

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'warn' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    danger: 'bg-danger-soft text-danger',
    warn: 'bg-warn-soft text-warn',
    success: 'bg-success-soft text-success',
    info: 'bg-brand-soft text-brand-strong',
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex gap-2.5 rounded-xl px-4 py-3 text-sm font-medium ${styles}`}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-paper text-muted">
        <Inbox className="h-7 w-7" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <AlertCircle className="h-9 w-9 text-danger" aria-hidden="true" />
      <h3 className="mt-3 text-lg font-semibold">{t('common.somethingWrong')}</h3>
      {message && <p className="mt-1 text-muted">{message}</p>}
      {onRetry && (
        <button type="button" className="btn-outline mt-4" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-12 w-full" />
      ))}
    </div>
  );
}

const BADGE: Record<string, string> = {
  live: 'bg-success-soft text-success',
  active: 'bg-success-soft text-success',
  onboarding: 'bg-brand-soft text-brand-strong',
  trialing: 'bg-brand-soft text-brand-strong',
  suspended: 'bg-danger-soft text-danger',
  disabled: 'bg-danger-soft text-danger',
  read_only: 'bg-warn-soft text-warn',
  past_due: 'bg-warn-soft text-warn',
  demo: 'border border-dashed border-ink/30 bg-surface text-ink',
};

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${BADGE[tone] ?? 'bg-ink/5 text-ink'}`}>{children}</span>;
}

export function DemoBadge() {
  const { t } = useTranslation();
  return (
    <Badge tone="demo">
      <span className="uppercase tracking-wider">{t('common.demo')}</span>
    </Badge>
  );
}

// ---------- Dialog (focus trap, Escape, scroll lock, focus restore) ----------

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => (panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key !== 'Tab' || !panel.current) return;
      const nodes = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!nodes.length) return;
      const [first, last] = [nodes[0], nodes[nodes.length - 1]];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div className="absolute inset-0 bg-ink/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden="true" />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-2xl sm:rounded-3xl sm:p-6 ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id={titleId} className="text-xl font-bold">
                {title}
              </h2>
              <button type="button" onClick={onClose} className="-m-2 rounded-full p-2 text-muted hover:bg-ink/5" aria-label={t('common.close')}>
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------- Toasts (aria-live) ----------

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}
interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}
let nextId = 1;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone = 'success') => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { id, message, tone }] });
    setTimeout(() => get().dismiss(id), tone === 'error' ? 6000 : 3500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
export const toast = {
  success: (m: string) => useToasts.getState().push(m, 'success'),
  error: (m: string) => useToasts.getState().push(m, 'error'),
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  const { t } = useTranslation();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:top-auto sm:items-end">
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 shadow-xl ${item.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-paper'}`}
          >
            {item.tone === 'error' ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />}
            <p className="flex-1 text-[15px]">{item.message}</p>
            <button type="button" onClick={() => dismiss(item.id)} className="rounded-full p-0.5 opacity-80 hover:opacity-100" aria-label={t('common.close')}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
