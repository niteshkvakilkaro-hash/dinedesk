import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { BedDouble, CalendarDays, Clock, Contact, CornerDownLeft, ReceiptText, Search, UtensilsCrossed, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { Spinner } from '@/components/ui';
import { useAdminMenu } from '@/features/menu/api';
import type { StaffReservation } from '@/features/reservations/api';
import type { Stay } from '@/features/hotel/api';
import { destinationsFor, type Access, type Destination } from './navigation';
import { hasDigits, normalise, rankDocs } from './search';

// ---------- Recently opened pages (this device only) ----------

const RECENT_KEY = 'dd_recent_pages';

export function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

/** Remembers a dashboard page (the last five, newest first). */
export function rememberPage(pathname: string) {
  const path = pathname.replace(/(.)\/+$/, '$1');
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([path, ...readRecent().filter((p) => p !== path)].slice(0, 5)));
  } catch {
    /* private mode or storage full */
  }
}

/** Ctrl K on Windows / Android, ⌘K on Apple devices. */
export const shortcutLabel = () => (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K');

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

interface Option {
  id: string;
  to: string;
  icon: typeof Search;
  label: string;
  hint?: string;
  aside?: string;
}
interface Section {
  key: string;
  title: string;
  options: Option[];
}

interface OrderHit { id: number; number: number; customer_name: string; total: string; status: string }
interface CustomerHit { id: number; name: string; phone: string | null; orders_count: number }

/**
 * "What are you looking for?": every page and tucked-away feature this person may open, found
 * by its name, a plain word (bill, chutti, printer…) or a keyword in their language, plus dishes,
 * orders, customers and bookings from the existing lists. Combobox + listbox pattern: focus stays
 * in the box, arrow keys move, Enter opens, Esc closes.
 */
export function CommandPalette({ open, onClose, access }: { open: boolean; onClose: () => void; access: Access }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const q = query.trim();
  const dq = useDebounced(q, 250);

  // Static index in the current language, with English titles and keywords searched too.
  const destinations = useMemo(() => destinationsFor(access), [access]);
  const docs = useMemo(() => {
    const en = i18n.getFixedT('en');
    const isEn = i18n.resolvedLanguage === 'en';
    return destinations.map((d) => ({
      d,
      id: d.id,
      title: t(d.title),
      desc: t(`dashboard.find.items.${d.id}.desc`),
      keywords: t(`dashboard.find.items.${d.id}.keys`),
      enTitle: isEn ? '' : en(d.title),
      enKeywords: isEn ? '' : en(`dashboard.find.items.${d.id}.keys`),
    }));
  }, [destinations, t, i18n]);

  // Live results from lists the dashboard already has (each only with permission).
  const live = open && dq.length >= 2;
  const menu = useAdminMenu(live && access.menu);
  const orders = useQuery({
    queryKey: ['find', 'orders', dq],
    queryFn: async () => (await api.get<OrderHit[]>('/tenant/orders', { view: 'all', search: dq })).data,
    enabled: live && access.orders && hasDigits(dq),
    staleTime: 30_000,
  });
  const customers = useQuery({
    queryKey: ['find', 'customers', dq],
    queryFn: async () => (await api.get<CustomerHit[]>('/tenant/customers', { q: dq })).data,
    enabled: live && access.customers,
    staleTime: 30_000,
  });
  const bookings = useQuery({
    queryKey: ['find', 'bookings', dq],
    queryFn: async () => (await api.get<{ reservations: StaffReservation[] }>('/tenant/reservations', { q: dq })).data.reservations,
    enabled: live && dq.length >= 3 && access.reservations,
    staleTime: 30_000,
  });
  const stays = useQuery({
    queryKey: ['find', 'stays', dq],
    queryFn: async () => (await api.get<Stay[]>('/tenant/hotel/bookings', { q: dq })).data,
    enabled: live && dq.length >= 3 && access.hotelDesk,
    staleTime: 30_000,
  });
  const searching = q !== dq || [menu, orders, customers, bookings, stays].some((r) => r.fetchStatus === 'fetching');

  const sections = useMemo<Section[]>(() => {
    const toOption = (d: Destination, prefix = 'p'): Option => ({ id: `${prefix}-${d.id}`, to: d.to, icon: d.icon, label: t(d.title), hint: t(`dashboard.find.items.${d.id}.desc`), aside: t(`dashboard.groups.${d.group}`) });
    if (!q) {
      const byPath = new Map<string, Destination>();
      for (const d of destinations) if (!byPath.has(d.to)) byPath.set(d.to, d);
      const recent = readRecent().map((p) => byPath.get(p)).filter((d): d is Destination => !!d);
      return recent.length ? [{ key: 'recent', title: t('dashboard.find.recent'), options: recent.map((d) => toOption(d, 'r')) }] : [];
    }
    const out: Section[] = [];
    const pages = rankDocs(docs, q, 8).map((x) => toOption(x.d));
    if (pages.length) out.push({ key: 'pages', title: t('dashboard.find.sections.pages'), options: pages });
    if (dq.length >= 2 && access.menu && menu.data) {
      const nq = normalise(dq);
      const dishes = menu.data.categories
        .flatMap((c) => c.items.map((i) => ({ i, c })))
        .filter(({ i }) => normalise(`${i.name} ${i.name_hi ?? ''}`).includes(nq))
        .slice(0, 5)
        .map(({ i, c }): Option => ({ id: `d-${i.id}`, to: `/dashboard/menu?q=${encodeURIComponent(i.name)}`, icon: UtensilsCrossed, label: i.name, hint: c.name, aside: formatINR(i.price) }));
      if (dishes.length) out.push({ key: 'dishes', title: t('dashboard.find.sections.dishes'), options: dishes });
    }
    if (orders.data?.length && hasDigits(dq)) {
      out.push({
        key: 'orders',
        title: t('dashboard.find.sections.orders'),
        options: orders.data.slice(0, 5).map((o) => ({ id: `o-${o.id}`, to: `/dashboard/orders?open=${o.id}`, icon: ReceiptText, label: t('dashboard.find.order', { number: o.number }), hint: o.customer_name, aside: formatINR(o.total) })),
      });
    }
    if (customers.data?.length) {
      out.push({
        key: 'customers',
        title: t('dashboard.find.sections.customers'),
        options: customers.data.slice(0, 5).map((c) => ({ id: `c-${c.id}`, to: `/dashboard/customers?open=${c.id}`, icon: Contact, label: c.name, hint: c.phone ?? undefined })),
      });
    }
    if (bookings.data?.length) {
      out.push({
        key: 'bookings',
        title: t('dashboard.find.sections.bookings'),
        options: bookings.data.slice(0, 5).map((r) => ({ id: `b-${r.id}`, to: `/dashboard/reservations?q=${encodeURIComponent(r.code)}`, icon: CalendarDays, label: r.name, hint: `${r.code} · ${r.date} ${r.time}` })),
      });
    }
    if (stays.data?.length) {
      out.push({
        key: 'stays',
        title: t('dashboard.find.sections.stays'),
        options: stays.data.slice(0, 5).map((s) => ({ id: `s-${s.id}`, to: `/dashboard/hotel?tab=bookings&open=${s.id}`, icon: BedDouble, label: s.name, hint: `${s.code} · ${s.check_in} → ${s.check_out}` })),
      });
    }
    return out;
  }, [q, dq, docs, destinations, access.menu, menu.data, orders.data, customers.data, bookings.data, stays.data, t]);

  const options = sections.flatMap((s) => s.options);
  const optionId = (o: Option) => `${baseId}-${o.id}`;

  useEffect(() => setActive(0), [q, sections.length]);
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
  }, [open]);

  // Scroll lock, focus into the box, focus back where it was on close.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => input.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (o: Option | undefined) => {
    if (!o) return;
    onClose();
    navigate(o.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Home' && options.length && e.ctrlKey) {
      setActive(0);
    } else if (e.key === 'End' && options.length && e.ctrlKey) {
      setActive(options.length - 1);
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      go(options[active]);
    } else if (e.key === 'Tab' && panel.current) {
      // Keep focus inside the dialog.
      const nodes = [...panel.current.querySelectorAll<HTMLElement>('input,button:not([disabled])')];
      const [first, last] = [nodes[0], nodes[nodes.length - 1]];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };

  const examples = t('dashboard.find.examples').split(/[,،、]/).map((s) => s.trim()).filter(Boolean);
  const listId = `${baseId}-list`;
  let index = -1;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center sm:p-6 sm:pt-[10vh]" onKeyDown={onKeyDown}>
          <motion.div className="absolute inset-0 bg-ink/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden="true" />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={t('dashboard.find.label')}
            className="relative flex h-full w-full flex-col overflow-hidden bg-surface shadow-2xl sm:h-auto sm:max-h-[75vh] sm:max-w-2xl sm:rounded-3xl"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3 border-b border-line px-4 sm:px-5" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
              <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
              <input
                ref={input}
                type="text"
                role="combobox"
                aria-expanded={options.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={options[active] ? optionId(options[active]) : undefined}
                aria-label={t('dashboard.find.label')}
                placeholder={t('dashboard.find.placeholder')}
                className="min-h-16 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-muted/80 focus:outline-none focus-visible:outline-none sm:text-lg"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
              />
              {searching && q.length >= 2 && <Spinner className="h-4 w-4 shrink-0" label={t('dashboard.find.searching')} />}
              <button type="button" onClick={onClose} className="-mr-2 shrink-0 rounded-full p-2 text-muted hover:bg-ink/5" aria-label={t('common.close')}>
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div ref={list} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
              <div id={listId} role="listbox" aria-label={t('dashboard.find.label')}>
              {sections.map((s) => (
                <div key={s.key} role="group" aria-labelledby={`${baseId}-h-${s.key}`} className="mb-2 last:mb-0">
                  <p id={`${baseId}-h-${s.key}`} role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                    {s.key === 'recent' && <Clock className="-mt-0.5 me-1 inline h-3.5 w-3.5" aria-hidden="true" />}
                    {s.title}
                  </p>
                  {s.options.map((o) => {
                    index += 1;
                    const i = index;
                    const selected = i === active;
                    const Icon = o.icon;
                    return (
                      <div
                        key={o.id}
                        id={optionId(o)}
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => active !== i && setActive(i)}
                        onClick={() => go(o)}
                        className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ${selected ? 'bg-ink/[0.06]' : ''}`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-brand text-white' : 'bg-paper text-ink'}`}>
                          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{o.label}</span>
                          {o.hint && <span className="block truncate text-sm text-muted">{o.hint}</span>}
                        </span>
                        {o.aside && <span className="hidden shrink-0 text-xs font-semibold text-muted sm:inline">{o.aside}</span>}
                        {selected && <CornerDownLeft className="hidden h-4 w-4 shrink-0 text-muted sm:block rtl:-scale-x-100" aria-hidden="true" />}
                      </div>
                    );
                  })}
                </div>
              ))}
              </div>

              {!q && (
                <Suggestions title={t('dashboard.find.suggestions')}>
                  {examples.map((ex) => (
                    <button key={ex} type="button" onClick={() => { setQuery(ex); input.current?.focus(); }} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold hover:border-ink/40">
                      {ex}
                    </button>
                  ))}
                </Suggestions>
              )}

              {q && !options.length && !searching && (
                <div className="px-4 py-8 text-center">
                  <p className="font-semibold">{t('dashboard.find.noResults', { query: q })}</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t('dashboard.find.noResultsHint')}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {examples.map((ex) => (
                      <button key={ex} type="button" onClick={() => { setQuery(ex); input.current?.focus(); }} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold hover:border-ink/40">
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <p className="sr-only" aria-live="polite">
              {q && !searching ? (options.length ? `${options.length}` : t('dashboard.find.noResults', { query: q })) : ''}
            </p>
            <div className="hidden border-t border-line px-5 py-2.5 text-xs text-muted sm:block">{t('dashboard.find.keys')}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Suggestions({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-3 pb-3 pt-2">
      <p className="pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
