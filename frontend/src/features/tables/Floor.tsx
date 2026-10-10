import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, BellRing, Combine, ReceiptText, Sparkles, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatMoney as formatINR } from '@/lib/format';
import { useCan, useFeature } from '@/hooks/useSession';
import { Badge, Spinner, toast } from '@/components/ui';
import { BillDialog, type BillTarget } from '@/features/pos/BillDialog';
import type { LiveTable } from './api';

/** Floor canvas in fixed units; it scales to the screen width. */
export const FLOOR_W = 1000;
export const FLOOR_H = 640;

export function tableSize(t: Pick<LiveTable, 'seats' | 'shape'>) {
  const base = t.seats <= 2 ? 64 : t.seats <= 4 ? 78 : t.seats <= 6 ? 92 : 108;
  return t.shape === 'long' ? { w: base * 1.6, h: base * 0.8 } : { w: base, h: base };
}

/** Tables with no saved position are placed in rows so a new floor starts tidy. */
export function withPositions<T extends { pos_x: number | null; pos_y: number | null; seats: number; shape: LiveTable['shape'] }>(tables: T[]): (T & { x: number; y: number })[] {
  let col = 0;
  let row = 0;
  return tables.map((t) => {
    if (t.pos_x !== null && t.pos_y !== null) return { ...t, x: t.pos_x, y: t.pos_y };
    const x = 40 + col * 150;
    const y = 40 + row * 150;
    col++;
    if (40 + col * 150 > FLOOR_W - 120) {
      col = 0;
      row++;
    }
    return { ...t, x, y: Math.min(y, FLOOR_H - 110) };
  });
}

const STATE_FILL: Record<LiveTable['state'], string> = {
  free: 'bg-success-soft border-success/50 text-ink',
  occupied: 'bg-brand-soft border-brand text-ink',
  bill_requested: 'bg-warn-soft border-warn text-ink ring-4 ring-warn/30',
  cleaning: 'bg-ink/10 border-ink/30 text-ink border-dashed',
  inactive: 'bg-surface border-line text-muted opacity-50',
};

function useScale(ref: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / FLOOR_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

/** Side panel for one table: running bill, calls, and transfer / merge / clean / bill. */
function TablePanel({ table, tables, onClose, onBill }: { table: LiveTable; tables: LiveTable[]; onClose: () => void; onBill: (t: BillTarget) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const posPerm = useCan('pos.use');
  const posPlan = useFeature('pos');
  const canPos = posPerm && posPlan;
  const [mode, setMode] = useState<'transfer' | 'merge' | null>(null);
  const act = useMutation<unknown, ApiError, { path: string; body?: unknown; ok: string }>({
    mutationFn: ({ path, body }) => api.post(path, body),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['tables-live'] });
      toast.success(v.ok);
      setMode(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const s = table.session;
  const targets = tables.filter((x) => x.id !== table.id && x.is_active && (mode === 'transfer' ? !x.session : !!x.session));

  return (
    <aside className="card space-y-4 p-4" aria-label={t('tablesAdmin.panel', { table: table.label })}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-2xl font-extrabold">{table.label}</p>
          <p className="text-sm text-muted">
            {t('reservationsAdmin.seats', { count: table.seats })}
            {table.area && ` · ${table.area}`}
          </p>
        </div>
        <button type="button" className="btn-ghost !min-h-10 !px-2" onClick={onClose} aria-label={t('common.close')}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <Badge tone={table.state === 'free' ? 'live' : table.state === 'bill_requested' ? 'pending' : table.state === 'occupied' ? 'confirmed' : 'unpaid'}>{t(`tablesAdmin.state.${table.state}`)}</Badge>
      {table.requests.map((r) => (
        <div key={r.id} className="flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">
          {r.type === 'bill' ? <ReceiptText className="h-4 w-4" aria-hidden="true" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
          <span className="flex-1">{t(`tablesAdmin.request.${r.type}`)}</span>
          <button type="button" className="rounded-md bg-surface px-2 py-1 text-xs font-bold text-ink" onClick={() => act.mutate({ path: `/tenant/tables/requests/${r.id}/done`, ok: t('tablesAdmin.doneToast') })}>
            {t('tablesAdmin.done')}
          </button>
        </div>
      ))}
      {s && (
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt>{t('tablesAdmin.sessionLine', { count: s.orders_count, orders: s.orders_count, items: s.items_count })}</dt><dd className="font-bold tabular-nums">{formatINR(s.total)}</dd></div>
          <div className="flex justify-between text-muted"><dt>{t('tablesAdmin.since', { time: new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(s.opened_at)) })}</dt><dd>{s.active_orders > 0 && t('tablesAdmin.inKitchen', { count: s.active_orders })}</dd></div>
          {s.invoice && <div className="flex justify-between"><dt>{t('tablesAdmin.billMade')}</dt><dd className="font-mono">{s.invoice.number}</dd></div>}
        </dl>
      )}
      {table.booking && <p className="text-sm">{t('tablesAdmin.booked', { time: table.booking.time, name: table.booking.name, count: table.booking.party_size })}</p>}

      <div className="grid gap-2">
        {s && canPos && (
          <button type="button" className="btn-primary" onClick={() => onBill({ title: t('pos.billForTable', { table: table.label }), sessionId: s.invoice ? undefined : s.id, invoiceId: s.invoice?.id })}>
            <ReceiptText className="h-4 w-4" aria-hidden="true" /> {s.invoice ? t('tablesAdmin.takePayment') : t('tablesAdmin.billAndPay')}
          </button>
        )}
        {s && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-outline !min-h-10 text-sm" aria-pressed={mode === 'transfer'} onClick={() => setMode(mode === 'transfer' ? null : 'transfer')}>
              <ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> {t('tablesAdmin.transfer')}
            </button>
            <button type="button" className="btn-outline !min-h-10 text-sm" aria-pressed={mode === 'merge'} onClick={() => setMode(mode === 'merge' ? null : 'merge')}>
              <Combine className="h-4 w-4" aria-hidden="true" /> {t('tablesAdmin.merge')}
            </button>
          </div>
        )}
        {mode && (
          <div className="rounded-xl bg-ink/5 p-3">
            <p className="mb-2 text-sm font-semibold">{mode === 'transfer' ? t('tablesAdmin.transferTo') : t('tablesAdmin.mergeWith')}</p>
            {targets.length === 0 && <p className="text-sm text-muted">{mode === 'transfer' ? t('tablesAdmin.noFree') : t('tablesAdmin.noOther')}</p>}
            <div className="flex flex-wrap gap-2">
              {targets.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-bold"
                  disabled={act.isPending}
                  onClick={() =>
                    mode === 'transfer'
                      ? act.mutate({ path: `/tenant/tables/sessions/${s!.id}/transfer`, body: { table_id: x.id }, ok: t('tablesAdmin.transferred', { from: table.label, to: x.label }) })
                      : act.mutate({ path: `/tenant/tables/sessions/${s!.id}/merge`, body: { session_id: x.session!.id }, ok: t('tablesAdmin.merged', { from: x.label, to: table.label }) })
                  }
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {table.state === 'cleaning' && (
          <button type="button" className="btn-outline" onClick={() => act.mutate({ path: `/tenant/tables/${table.id}/clean`, ok: t('tablesAdmin.cleaned', { table: table.label }) })}>
            {act.isPending ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden="true" />} {t('tablesAdmin.markClean')}
          </button>
        )}
      </div>
    </aside>
  );
}

/** Live floor: every table where it stands, coloured by state. */
export function FloorView({ tables }: { tables: LiveTable[] }) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const scale = useScale(box);
  const areas = useMemo(() => Array.from(new Set(tables.map((x) => x.area).filter(Boolean))) as string[], [tables]);
  const [area, setArea] = useState<string>('');
  const [selected, setSelected] = useState<number | null>(null);
  const [bill, setBill] = useState<BillTarget | null>(null);
  const placed = withPositions(tables.filter((x) => !area || x.area === area));
  const current = tables.find((x) => x.id === selected) ?? null;

  return (
    <div className="space-y-3">
      {areas.length > 0 && (
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label={t('tablesAdmin.area')}>
          {['', ...areas].map((a) => (
            <button key={a || 'all'} type="button" aria-pressed={area === a} onClick={() => setArea(a)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${area === a ? 'border-ink bg-ink text-paper' : 'border-line bg-surface'}`}>
              {a || t('reservationsAdmin.all')}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-xs">
        {(['free', 'occupied', 'bill_requested', 'cleaning'] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded border-2 ${STATE_FILL[s]}`} aria-hidden="true" />
            {t(`tablesAdmin.state.${s}`)}
          </span>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div ref={box} className="relative w-full overflow-hidden rounded-2xl border border-line bg-[repeating-linear-gradient(0deg,transparent,transparent_39px,rgb(0_0_0/0.04)_40px),repeating-linear-gradient(90deg,transparent,transparent_39px,rgb(0_0_0/0.04)_40px)] bg-surface" style={{ height: FLOOR_H * scale }}>
          {placed.map((x) => {
            const size = tableSize(x);
            const calls = x.requests.length;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => setSelected(x.id)}
                aria-pressed={selected === x.id}
                aria-label={`${x.label}, ${t(`tablesAdmin.state.${x.state}`)}${x.session ? `, ${formatINR(x.session.total)}` : ''}${calls ? `, ${t('tablesAdmin.openRequests', { count: calls })}` : ''}`}
                className={`absolute flex flex-col items-center justify-center border-2 font-bold shadow-sm transition-transform hover:scale-105 ${x.shape === 'round' ? 'rounded-full' : 'rounded-xl'} ${STATE_FILL[x.state]} ${selected === x.id ? 'outline outline-3 outline-offset-2 outline-ink' : ''}`}
                style={{ left: x.x * scale, top: x.y * scale, width: size.w * scale, height: size.h * scale, fontSize: Math.max(11, 16 * scale) }}
              >
                <span>{x.label}</span>
                {x.session && <span className="font-semibold tabular-nums" style={{ fontSize: Math.max(9, 11 * scale) }}>{formatINR(x.session.total)}</span>}
                {calls > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 animate-pulse items-center justify-center rounded-full bg-warn text-[10px] text-white" aria-hidden="true">
                    {calls}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {current ? (
          <TablePanel table={current} tables={tables} onClose={() => setSelected(null)} onBill={setBill} />
        ) : (
          <p className="card p-4 text-sm text-muted">{t('tablesAdmin.pickTable')}</p>
        )}
      </div>
      <BillDialog target={bill} onClose={() => setBill(null)} />
    </div>
  );
}

/** Set-up: drag tables into place and pick their shape. */
export function FloorEditor({ tables, onSaved }: { tables: { id: number; label: string; seats: number; area: string | null; pos_x: number | null; pos_y: number | null; shape: LiveTable['shape'] }[]; onSaved?: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const box = useRef<HTMLDivElement>(null);
  const scale = useScale(box);
  const [items, setItems] = useState(() => withPositions(tables));
  const [selected, setSelected] = useState<number | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setItems(withPositions(tables));
    setDirty(false);
  }, [tables]);

  const save = useMutation<unknown, ApiError>({
    mutationFn: () => api.put('/tenant/tables/layout', { tables: items.map((x) => ({ id: x.id, x: Math.round(x.x), y: Math.round(x.y), shape: x.shape })) }),
    onSuccess: () => {
      toast.success(t('tablesAdmin.layoutSaved'));
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['tables'] });
      void qc.invalidateQueries({ queryKey: ['tables-live'] });
      onSaved?.();
    },
    onError: (e) => toast.error(e.message),
  });
  const move = (id: number, x: number, y: number) => {
    setItems((all) =>
      all.map((it) => {
        if (it.id !== id) return it;
        const s = tableSize(it);
        // Snap to a 10-unit grid and keep inside the floor.
        return { ...it, x: Math.round(Math.min(Math.max(0, x), FLOOR_W - s.w) / 10) * 10, y: Math.round(Math.min(Math.max(0, y), FLOOR_H - s.h) / 10) * 10 };
      }),
    );
    setDirty(true);
  };
  const point = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  const sel = items.find((x) => x.id === selected);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t('tablesAdmin.arrangeHint')}</p>
      <div
        ref={box}
        className="relative w-full touch-none overflow-hidden rounded-2xl border border-line bg-[repeating-linear-gradient(0deg,transparent,transparent_39px,rgb(0_0_0/0.05)_40px),repeating-linear-gradient(90deg,transparent,transparent_39px,rgb(0_0_0/0.05)_40px)] bg-surface"
        style={{ height: FLOOR_H * scale }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const p = point(e);
          move(drag.current.id, p.x - drag.current.dx, p.y - drag.current.dy);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      >
        {items.map((x) => {
          const size = tableSize(x);
          return (
            <button
              key={x.id}
              type="button"
              onPointerDown={(e) => {
                const p = point(e);
                drag.current = { id: x.id, dx: p.x - x.x, dy: p.y - x.y };
                setSelected(x.id);
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 50 : 10;
                const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
                if (d) {
                  e.preventDefault();
                  move(x.id, x.x + d[0], x.y + d[1]);
                }
              }}
              onFocus={() => setSelected(x.id)}
              aria-label={t('tablesAdmin.moveTable', { table: x.label })}
              className={`absolute flex cursor-grab items-center justify-center border-2 border-ink/40 bg-paper font-bold shadow active:cursor-grabbing ${x.shape === 'round' ? 'rounded-full' : 'rounded-xl'} ${selected === x.id ? 'outline outline-3 outline-offset-2 outline-brand' : ''}`}
              style={{ left: x.x * scale, top: x.y * scale, width: size.w * scale, height: size.h * scale, fontSize: Math.max(11, 16 * scale) }}
            >
              {x.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {sel && (
          <div className="flex items-center gap-1 rounded-full bg-ink/5 p-1" role="radiogroup" aria-label={t('tablesAdmin.shape', { table: sel.label })}>
            <span className="px-2 text-sm font-semibold">{sel.label}</span>
            {(['square', 'round', 'long'] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={sel.shape === s} onClick={() => { setItems(items.map((it) => (it.id === sel.id ? { ...it, shape: s } : it))); setDirty(true); }} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${sel.shape === s ? 'bg-surface shadow' : 'text-muted'}`}>
                {t(`tablesAdmin.shapes.${s}`)}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn-primary ml-auto" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Spinner /> : t('tablesAdmin.saveLayout')}
        </button>
      </div>
    </div>
  );
}
