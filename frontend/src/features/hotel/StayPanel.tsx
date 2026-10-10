import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BedDouble, CalendarRange, CreditCard, Download, Eye, FileLock2, LogIn, LogOut, Plus, Trash2, Undo2 } from 'lucide-react';
import { api, ApiError, downloadFile, openFile } from '@/lib/api';
import { formatDateTime, formatMoney, formatPhone } from '@/lib/format';
import { Alert, Badge, Dialog, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';
import { FOLIO_MODES, ID_TYPES, shortDate, STATUS_TONE, todayIst, useStay, type DeskAvailability, type FolioMode, type StayDetail } from './api';

type Action = 'checkin' | 'checkout' | 'dates' | 'rate' | 'charge' | 'payment' | 'cancel' | 'room' | null;

function useStayAction(id: number) {
  const qc = useQueryClient();
  return (data: StayDetail) => {
    qc.setQueryData(['hotel', 'stay', id], data);
    void qc.invalidateQueries({ queryKey: ['hotel'], predicate: (q) => q.queryKey[1] !== 'stay' });
  };
}

/** Free rooms of the stay's type for its dates (to assign / check in / move). */
function useFreeRooms(stay: StayDetail | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['hotel', 'free-rooms', stay?.id, stay?.check_in, stay?.check_out],
    queryFn: async () => (await api.get<DeskAvailability[]>('/tenant/hotel/availability', { check_in: stay!.check_in, check_out: stay!.check_out, adults: 1 })).data.find((t) => t.id === stay!.room_type.id)?.free_rooms ?? [],
    enabled: enabled && !!stay,
  });
}

function Summary({ stay }: { stay: StayDetail }) {
  const { t } = useTranslation();
  const s = stay.folio.summary;
  return (
    <dl className="grid grid-cols-2 gap-2 rounded-xl bg-ink/[0.03] p-4 text-sm sm:grid-cols-4">
      <div><dt className="text-muted">{t('hotel.folio.charges')}</dt><dd className="font-bold">{formatMoney(s.charges)}</dd></div>
      <div><dt className="text-muted">{t('hotel.folio.gst')}</dt><dd className="font-bold">{formatMoney(s.tax)}</dd></div>
      <div><dt className="text-muted">{t('hotel.folio.paid')}</dt><dd className="font-bold">{formatMoney(s.paid)}</dd></div>
      <div><dt className="text-muted">{Number(s.balance) < 0 ? t('hotel.folio.toRefund') : t('hotel.folio.balance')}</dt><dd className={`text-lg font-extrabold ${Number(s.balance) > 0 ? 'text-warn' : Number(s.balance) < 0 ? 'text-danger' : 'text-success'}`}>{formatMoney(Math.abs(Number(s.balance)))}</dd></div>
    </dl>
  );
}

function Folio({ stay, onDone }: { stay: StayDetail; onDone: (d: StayDetail) => void }) {
  const { t } = useTranslation();
  const open = stay.status === 'confirmed' || stay.status === 'checked_in';
  const voidItem = useMutation<StayDetail, ApiError, number>({
    mutationFn: async (itemId) => {
      const reason = window.prompt(t('hotel.folio.removeReason'));
      if (!reason) throw new ApiError('', 0);
      return (await api.post<StayDetail>(`/tenant/hotel/bookings/${stay.id}/charges/${itemId}/void`, { reason })).data;
    },
    onSuccess: onDone,
    onError: (e) => e.message && toast.error(e.message),
  });
  return (
    <section aria-labelledby="folio-h" className="space-y-3">
      <h3 id="folio-h" className="font-bold">{t('hotel.folio.title')}</h3>
      {!stay.folio.items.length && stay.status !== 'checked_in' && <p className="text-sm text-muted">{t('hotel.folio.beforeCheckIn', { total: formatMoney(stay.total) })}</p>}
      {!!stay.folio.items.length && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1.5 font-semibold">{t('hotel.folio.date')}</th><th className="font-semibold">{t('hotel.folio.item')}</th><th className="text-right font-semibold">{t('hotel.folio.amount')}</th><th className="text-right font-semibold">{t('hotel.folio.gst')}</th><th /></tr></thead>
            <tbody className="divide-y divide-ink/5">
              {stay.folio.items.map((i) => (
                <tr key={i.id} className={i.voided ? 'text-muted line-through' : ''} title={i.void_reason ?? undefined}>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{shortDate(i.date)}</td>
                  <td className="pr-2">{i.description}{i.quantity > 1 && ` × ${i.quantity}`}</td>
                  <td className="text-right whitespace-nowrap">{formatMoney(i.amount)}</td>
                  <td className="text-right whitespace-nowrap">{formatMoney(i.tax)}</td>
                  <td className="w-8 text-right">{open && i.type === 'extra' && !i.voided && <button type="button" className="btn-ghost !min-h-8 !px-1.5 text-danger" onClick={() => voidItem.mutate(i.id)} aria-label={t('hotel.folio.remove', { name: i.description })}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!!stay.folio.payments.length && (
        <ul className="space-y-1 text-sm">
          {stay.folio.payments.map((p) => (
            <li key={p.id} className="flex justify-between gap-2">
              <span>{t(`hotel.kind.${p.kind}`)} · {t(`hotel.mode.${p.mode}`)}{p.reference && <span className="text-muted"> · {p.reference}</span>} <span className="text-muted">· {formatDateTime(p.received_at)}</span></span>
              <span className={`font-semibold ${p.kind === 'refund' ? 'text-danger' : ''}`}>{p.kind === 'refund' ? '−' : ''}{formatMoney(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <Summary stay={stay} />
    </section>
  );
}

function Documents({ stay, onDone }: { stay: StayDetail; onDone: (d: StayDetail) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [type, setType] = useState<string>('aadhaar');
  const [file, setFile] = useState<File | null>(null);
  const upload = useMutation<StayDetail, ApiError>({
    mutationFn: async () => {
      const form = new FormData();
      form.append('doc_type', type);
      form.append('file', file!);
      return (await api.post<StayDetail>(`/tenant/hotel/bookings/${stay.id}/documents`, form)).data;
    },
    onSuccess: (d) => { setFile(null); onDone(d); toast.success(t('hotel.docs.saved')); },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation<unknown, ApiError, number>({
    mutationFn: (docId) => api.delete(`/tenant/hotel/documents/${docId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['hotel', 'stay', stay.id] }),
    onError: (e) => toast.error(e.message),
  });
  if (!stay.documents) return null;
  const canAdd = stay.status === 'confirmed' || stay.status === 'checked_in';
  return (
    <section aria-labelledby="docs-h" className="space-y-2 rounded-xl border border-ink/10 p-4">
      <h3 id="docs-h" className="flex items-center gap-2 font-bold"><FileLock2 className="h-4 w-4" aria-hidden="true" /> {t('hotel.docs.title')}</h3>
      <p className="text-xs text-muted">{t('hotel.docs.privacy')}</p>
      <ul className="space-y-1 text-sm">
        {stay.documents.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2">
            <span>{t(`hotel.idType.${d.doc_type}`)} <span className="text-muted">· {t('hotel.docs.deleteAfter', { date: shortDate(d.delete_after) })}</span></span>
            <span className="flex gap-1">
              <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={() => void openFile(`/tenant/hotel/documents/${d.id}`).catch((e: Error) => toast.error(e.message))} aria-label={t('hotel.docs.view')}><Eye className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" className="btn-ghost !min-h-9 !px-2 text-danger" onClick={() => window.confirm(t('hotel.docs.confirmDelete')) && remove.mutate(d.id)} aria-label={t('common.delete')}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
            </span>
          </li>
        ))}
      </ul>
      {canAdd && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (file) upload.mutate(); }}>
          <select className="field-input !w-auto !py-2" aria-label={t('hotel.docs.type')} value={type} onChange={(e) => setType(e.target.value)}>
            {ID_TYPES.map((k) => <option key={k} value={k}>{t(`hotel.idType.${k}`)}</option>)}
          </select>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label={t('hotel.docs.file')} className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button type="submit" className="btn-outline !min-h-10 text-sm" disabled={!file || upload.isPending}>{upload.isPending ? <Spinner /> : t('hotel.docs.upload')}</button>
        </form>
      )}
    </section>
  );
}

function ActionDialog({ stay, action, onClose, onDone }: { stay: StayDetail; action: Action; onClose: () => void; onDone: (d: StayDetail) => void }) {
  const { t } = useTranslation();
  const today = todayIst();
  const free = useFreeRooms(stay, action === 'checkin' || action === 'room');
  const [f, setF] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<{ mode: FolioMode; amount: string; reference: string }[]>([]);
  const [err, setErr] = useState('');
  const [needForce, setNeedForce] = useState(false);
  const early = stay.status === 'checked_in' && today < stay.check_out;
  useEffect(() => {
    setErr('');
    setNeedForce(false);
    const due = Math.max(0, Number(stay.folio.summary.balance));
    setF({
      room_id: String(stay.room?.id ?? ''), id_type: stay.id_type ?? '', id_last4: stay.id_last4 ?? '', gstin: stay.gstin ?? '', company: stay.company ?? '',
      check_in: stay.check_in, check_out: stay.check_out, price: stay.rates[0]?.price ?? '', reason: '', description: '', quantity: '1', unit_price: '', tax_rate: '18',
      kind: stay.status === 'checked_in' ? 'payment' : 'advance', mode: 'cash', amount: '', reference: '', note: '', early: '1', buyer_name: '', buyer_gstin: stay.gstin ?? '',
    });
    setPayments(action === 'checkout' && due > 0 ? [{ mode: 'cash', amount: String(due), reference: '' }] : []);
  }, [action, stay.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useMutation<StayDetail, ApiError, boolean | undefined>({
    mutationFn: async (force) => {
      const base = `/tenant/hotel/bookings/${stay.id}`;
      const pick = (...k: string[]) => Object.fromEntries(k.map((x) => [x, f[x] === '' ? null : f[x]]));
      switch (action) {
        case 'checkin': return (await api.post<StayDetail>(`${base}/check-in`, { ...pick('room_id', 'id_type', 'id_last4', 'gstin', 'company'), force: !!force })).data;
        case 'room': return (await api.put<StayDetail>(`${base}/room`, { room_id: f.room_id ? Number(f.room_id) : null })).data;
        case 'dates': return (await api.put<StayDetail>(`${base}/dates`, pick('check_in', 'check_out'))).data;
        case 'rate': return (await api.put<StayDetail>(`${base}/rate`, { price: Number(f.price), reason: f.reason })).data;
        case 'charge': return (await api.post<StayDetail>(`${base}/charges`, { description: f.description, quantity: Number(f.quantity), unit_price: Number(f.unit_price), tax_rate: Number(f.tax_rate) })).data;
        case 'payment': return (await api.post<StayDetail>(`${base}/payments`, { kind: f.kind, mode: f.mode, amount: Number(f.amount), reference: f.reference || null })).data;
        case 'cancel': return (await api.post<StayDetail>(`${base}/status`, { status: 'cancelled', note: f.note })).data;
        case 'checkout': return (await api.post<StayDetail>(`${base}/check-out`, {
          payments: payments.filter((p) => Number(p.amount) > 0).map((p) => ({ mode: p.mode, amount: Number(p.amount), reference: p.reference || null })),
          charge_nights_stayed: early && f.early === '1',
          buyer: f.buyer_name || f.buyer_gstin ? { name: f.buyer_name || null, gstin: f.buyer_gstin || null } : null,
        })).data;
        default: throw new ApiError('', 0);
      }
    },
    onSuccess: (d) => {
      onDone(d);
      toast.success(t(`hotel.done.${action}`));
      onClose();
    },
    onError: (e) => {
      if (e.code === 'room_not_ready') setNeedForce(true);
      setErr(e.errors ? Object.values(e.errors)[0][0] : e.message);
    },
  });
  if (!action) return null;
  const input = (k: string, props: Record<string, unknown> = {}) => (a: Record<string, unknown>) => <input {...a} className="field-input" {...props} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />;
  const roomSelect = (
    <Field label={t('hotel.room')}>
      {(a) => (
        <select {...a} className="field-input" value={f.room_id ?? ''} onChange={(e) => setF({ ...f, room_id: e.target.value })}>
          <option value="">{action === 'room' ? t('hotel.noRoom') : t('hotel.pickRoom')}</option>
          {stay.room && !free.data?.some((r) => r.id === stay.room!.id) && <option value={stay.room.id}>{stay.room.number}</option>}
          {free.data?.map((r) => <option key={r.id} value={r.id}>{r.number} · {t(`hotel.hk.${r.housekeeping}`)}</option>)}
        </select>
      )}
    </Field>
  );
  const submit = (e: FormEvent) => { e.preventDefault(); setErr(''); run.mutate(false); };
  return (
    <Dialog open onClose={onClose} title={t(`hotel.act.${action}`)}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        {err && <Alert tone={needForce ? 'warn' : 'danger'}>{err}</Alert>}
        {action === 'checkin' && (
          <>
            {roomSelect}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('hotel.idTypeLabel')} optional>{(a) => <select {...a} className="field-input" value={f.id_type} onChange={(e) => setF({ ...f, id_type: e.target.value })}><option value="">—</option>{ID_TYPES.map((k) => <option key={k} value={k}>{t(`hotel.idType.${k}`)}</option>)}</select>}</Field>
              <Field label={t('hotel.idLast4')} optional hint={t('hotel.idLast4Hint')}>{input('id_last4', { maxLength: 4, inputMode: 'text', autoComplete: 'off' })}</Field>
              <Field label={t('hotel.company')} optional>{input('company', { maxLength: 120 })}</Field>
              <Field label={t('hotel.gstin')} optional>{input('gstin', { maxLength: 15, className: 'field-input uppercase' })}</Field>
            </div>
          </>
        )}
        {action === 'room' && roomSelect}
        {action === 'dates' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('hotel.checkIn')}>{input('check_in', { type: 'date', min: today, disabled: stay.status === 'checked_in' })}</Field>
            <Field label={t('hotel.checkOut')}>{input('check_out', { type: 'date', min: f.check_in })}</Field>
          </div>
        )}
        {action === 'rate' && (
          <>
            <Field label={t('hotel.ratePerNight')} hint={t('hotel.rateHint')}>{input('price', { type: 'number', min: 0, step: '1' })}</Field>
            <Field label={t('hotel.reason')}>{input('reason', { maxLength: 200 })}</Field>
          </>
        )}
        {action === 'charge' && (
          <>
            <Field label={t('hotel.chargeWhat')} hint={t('hotel.chargeHint')}>{input('description', { maxLength: 200 })}</Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('hotel.qty')}>{input('quantity', { type: 'number', min: 1, max: 100 })}</Field>
              <Field label={t('hotel.unitPrice')}>{input('unit_price', { type: 'number', min: 1 })}</Field>
              <Field label={t('hotel.gstRate')}>{(a) => <select {...a} className="field-input" value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })}>{[0, 5, 12, 18].map((r) => <option key={r} value={r}>{r}%</option>)}</select>}</Field>
            </div>
          </>
        )}
        {action === 'payment' && (
          <>
            <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="radiogroup" aria-label={t('hotel.paymentKind')}>
              {(stay.status === 'checked_out' || stay.status === 'cancelled' || stay.status === 'no_show' ? ['refund'] : stay.status === 'checked_in' ? ['payment', 'refund'] : ['advance', 'refund']).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF({ ...f, kind: k })} className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${f.kind === k ? 'bg-surface shadow' : 'text-muted'}`}>{t(`hotel.kind.${k}`)}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('hotel.mode.label')}>{(a) => <select {...a} className="field-input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>{[...FOLIO_MODES, 'online'].map((m) => <option key={m} value={m}>{t(`hotel.mode.${m}`)}</option>)}</select>}</Field>
              <Field label={t('hotel.amount')}>{input('amount', { type: 'number', min: 1 })}</Field>
            </div>
            <Field label={t('hotel.reference')} optional>{input('reference', { maxLength: 80 })}</Field>
          </>
        )}
        {action === 'cancel' && <Field label={t('hotel.cancelReason')}>{input('note', { maxLength: 255 })}</Field>}
        {action === 'checkout' && (
          <>
            {early && (
              <fieldset className="space-y-1.5 text-sm">
                <legend className="field-label">{t('hotel.leavingEarly', { date: shortDate(stay.check_out) })}</legend>
                <label className="flex items-center gap-2"><input type="radio" name="early" checked={f.early === '1'} onChange={() => setF({ ...f, early: '1' })} /> {t('hotel.chargeStayed')}</label>
                <label className="flex items-center gap-2"><input type="radio" name="early" checked={f.early === '0'} onChange={() => setF({ ...f, early: '0' })} /> {t('hotel.chargeBooked')}</label>
              </fieldset>
            )}
            <Summary stay={stay} />
            <div className="space-y-2">
              <p className="field-label">{t('hotel.takePayment')}</p>
              {payments.map((p, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <select className="field-input !w-auto !py-2" aria-label={t('hotel.mode.label')} value={p.mode} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, mode: e.target.value as FolioMode } : x)))}>{FOLIO_MODES.map((m) => <option key={m} value={m}>{t(`hotel.mode.${m}`)}</option>)}</select>
                  <input className="field-input !w-32 !py-2" type="number" min={0} aria-label={t('hotel.amount')} value={p.amount} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  {p.mode !== 'cash' && <input className="field-input !w-40 !py-2" aria-label={t('hotel.reference')} placeholder={t('hotel.reference')} value={p.reference} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))} />}
                  <button type="button" className="btn-ghost !min-h-10 !px-2" onClick={() => setPayments(payments.filter((_, j) => j !== i))} aria-label={t('common.remove')}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </div>
              ))}
              <button type="button" className="btn-outline !min-h-9 text-xs" onClick={() => setPayments([...payments, { mode: 'upi', amount: '', reference: '' }])}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> {t('hotel.addPayment')}</button>
              <p className="text-xs text-muted">{t('hotel.checkoutHint')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('hotel.billTo')} optional>{input('buyer_name', { maxLength: 120, placeholder: stay.company ?? stay.name })}</Field>
              <Field label={t('hotel.gstin')} optional>{input('buyer_gstin', { maxLength: 15, className: 'field-input uppercase' })}</Field>
            </div>
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          {needForce && <button type="button" className="btn-outline" onClick={() => run.mutate(true)}>{t('hotel.checkInAnyway')}</button>}
          <button type="submit" className="btn-primary" disabled={run.isPending}>{run.isPending ? <Spinner /> : t(`hotel.act.${action}`)}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function StayPanel({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { t } = useTranslation();
  const q = useStay(id);
  const done = useStayAction(id ?? 0);
  const [action, setAction] = useState<Action>(null);
  const transition = useMutation<StayDetail, ApiError, string>({
    mutationFn: async (status) => (await api.post<StayDetail>(`/tenant/hotel/bookings/${id}/status`, { status })).data,
    onSuccess: (d) => { done(d); toast.success(t('common.saved')); },
    onError: (e) => toast.error(e.message),
  });
  if (!id) return null;
  const s = q.data;
  const btn = (a: Action, label: string, Icon?: typeof LogIn, primary = false) => (
    <button type="button" className={`${primary ? 'btn-primary' : 'btn-outline'} !min-h-10 text-sm`} onClick={() => setAction(a)}>{Icon && <Icon className="h-4 w-4" aria-hidden="true" />} {label}</button>
  );
  return (
    <Dialog open onClose={onClose} title={s ? `${s.name} · ${s.code}` : t('common.loading')} wide>
      {q.isLoading && <SkeletonRows rows={6} />}
      {q.isError && <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} />}
      {s && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[s.status]}>{t(`hotel.status.${s.status}`)}</Badge>
            {s.awaiting_payment && <Badge tone="pending">{t('hotel.awaitingAdvance')}</Badge>}
            <span className="text-sm text-muted">{t(`hotel.source.${s.source}`)} · {formatDateTime(s.created_at)}</span>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">{t('hotel.stay')}</dt><dd className="font-semibold">{shortDate(s.check_in, true)} → {shortDate(s.check_out, true)} · {t('hotel.nights', { count: s.nights })}</dd></div>
            <div><dt className="text-muted">{t('hotel.guests')}</dt><dd className="font-semibold">{t('hotel.adults', { count: s.adults })}{s.children ? `, ${t('hotel.children', { count: s.children })}` : ''}</dd></div>
            <div><dt className="text-muted">{t('hotel.roomType')}</dt><dd className="font-semibold">{s.room_type.name}{s.room ? ` · ${t('hotel.roomNo', { number: s.room.number })}` : ''}</dd></div>
            <div><dt className="text-muted">{t('hotel.phone')}</dt><dd className="font-semibold"><a className="underline" href={`tel:${s.phone}`}>{formatPhone(s.phone)}</a>{s.email && <span className="font-normal text-muted"> · {s.email}</span>}</dd></div>
            {s.arrival_time && <div><dt className="text-muted">{t('hotel.arrival')}</dt><dd>{s.arrival_time}</dd></div>}
            {(s.company || s.gstin) && <div><dt className="text-muted">{t('hotel.company')}</dt><dd>{[s.company, s.gstin].filter(Boolean).join(' · ')}</dd></div>}
            {s.id_type && <div><dt className="text-muted">{t('hotel.idTypeLabel')}</dt><dd>{t(`hotel.idType.${s.id_type}`)}{s.id_last4 && ` ···${s.id_last4}`}</dd></div>}
            {s.requests && <div className="sm:col-span-2"><dt className="text-muted">{t('hotel.requests')}</dt><dd>{s.requests}</dd></div>}
            {s.cancel_reason && <div className="sm:col-span-2"><dt className="text-muted">{t('hotel.cancelReason')}</dt><dd>{s.cancel_reason}</dd></div>}
          </dl>

          <div className="flex flex-wrap gap-2">
            {s.status === 'pending' && !s.awaiting_payment && <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => transition.mutate('confirmed')} disabled={transition.isPending}>{t('hotel.act.confirm')}</button>}
            {s.status === 'confirmed' && btn('checkin', t('hotel.act.checkin'), LogIn, true)}
            {s.status === 'checked_in' && btn('checkout', t('hotel.act.checkout'), LogOut, true)}
            {(s.status === 'pending' || s.status === 'confirmed' || s.status === 'checked_in') && btn('room', s.room ? t('hotel.act.moveRoom') : t('hotel.act.room'), BedDouble)}
            {(s.status === 'pending' || s.status === 'confirmed' || s.status === 'checked_in') && btn('dates', t('hotel.act.dates'), CalendarRange)}
            {(s.status === 'pending' || s.status === 'confirmed' || s.status === 'checked_in') && btn('rate', t('hotel.act.rate'))}
            {s.status === 'checked_in' && btn('charge', t('hotel.act.charge'), Plus)}
            {s.status !== 'pending' && btn('payment', s.status === 'checked_in' || s.status === 'confirmed' ? t('hotel.act.payment') : t('hotel.act.refund'), s.status === 'checked_in' || s.status === 'confirmed' ? CreditCard : Undo2)}
            {s.status === 'confirmed' && todayIst() >= s.check_in && <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => window.confirm(t('hotel.confirmNoShow')) && transition.mutate('no_show')}>{t('hotel.act.noShow')}</button>}
            {(s.status === 'pending' || s.status === 'confirmed') && <button type="button" className="btn-ghost !min-h-10 text-sm text-danger" onClick={() => setAction('cancel')}>{t('hotel.act.cancel')}</button>}
            {s.invoice && <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => void downloadFile(`/tenant/hotel/bookings/${s.id}/invoice`, `${s.invoice!.number.replace(/\//g, '-')}.pdf`).catch((e: Error) => toast.error(e.message))}><Download className="h-4 w-4" aria-hidden="true" /> {t('hotel.invoice', { number: s.invoice.number })}</button>}
          </div>

          <Folio stay={s} onDone={done} />
          {!!s.orders.length && (
            <section aria-labelledby="rs-h">
              <h3 id="rs-h" className="font-bold">{t('hotel.roomService')}</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {s.orders.map((o) => <li key={o.id} className="flex justify-between"><span>#{o.number} · {t(`order.status.${o.status}`)} · {formatDateTime(o.placed_at)}</span><span className="font-semibold">{formatMoney(o.total)}</span></li>)}
              </ul>
            </section>
          )}
          <Documents stay={s} onDone={done} />
          <ActionDialog stay={s} action={action} onClose={() => setAction(null)} onDone={done} />
        </div>
      )}
    </Dialog>
  );
}
