import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { ImagePlus, Pencil, Plus, Printer, RefreshCw, Star, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/hooks/useSession';
import { formatMoney } from '@/lib/format';
import { Alert, Badge, Dialog, EmptyState, ErrorState, Field, SkeletonRows, Spinner, toast, Toggle } from '@/components/ui';
import { AMENITIES, shortDate, useHotelSettings, useRooms, useRoomTypes, type HotelSettings, type RoomRow, type RoomTypeRow } from './api';

const errorsOf = (e: ApiError) => (e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])) : { form: e.message });

function SettingsCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useHotelSettings();
  const [f, setF] = useState<HotelSettings | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  const save = useMutation<HotelSettings, ApiError>({
    mutationFn: async () => (await api.put<HotelSettings>('/tenant/hotel/settings', f)).data,
    onSuccess: (d) => { qc.setQueryData(['hotel', 'settings'], d); setErrors({}); toast.success(t('common.saved')); },
    onError: (e) => setErrors(errorsOf(e)),
  });
  if (q.isLoading || !f) return <SkeletonRows rows={4} />;
  const num = (k: keyof HotelSettings, label: string, props: Record<string, unknown> = {}) => (
    <Field label={label} error={errors[k]}>{(a) => <input {...a} type="number" className="field-input" {...props} value={String(f[k] ?? '')} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} />}</Field>
  );
  return (
    <section className="card space-y-4 p-5" aria-labelledby="hs-h">
      <h2 id="hs-h" className="text-lg font-bold">{t('hotel.setup.settings')}</h2>
      {errors.form && <Alert>{errors.form}</Alert>}
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <Toggle checked={f.online_booking} onChange={(v) => setF({ ...f, online_booking: v })} label={t('hotel.setup.onlineBooking')} hint={t('hotel.setup.onlineBookingHint')} />
        <Toggle checked={f.auto_confirm} onChange={(v) => setF({ ...f, auto_confirm: v })} label={t('hotel.setup.autoConfirm')} hint={t('hotel.setup.autoConfirmHint')} />
        <Toggle checked={f.room_service} onChange={(v) => setF({ ...f, room_service: v })} label={t('hotel.setup.roomService')} hint={t('hotel.setup.roomServiceHint')} />
        <Toggle checked={f.banquets} onChange={(v) => setF({ ...f, banquets: v })} label={t('hotel.setup.banquets')} hint={t('hotel.setup.banquetsHint')} />
        <Toggle checked={f.charge_gst} onChange={(v) => setF({ ...f, charge_gst: v })} label={t('hotel.setup.chargeGst')} hint={t('hotel.setup.chargeGstHint')} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label={t('hotel.setup.checkInTime')} error={errors.check_in_time}>{(a) => <input {...a} type="time" className="field-input" value={f.check_in_time} onChange={(e) => setF({ ...f, check_in_time: e.target.value })} />}</Field>
        <Field label={t('hotel.setup.checkOutTime')} error={errors.check_out_time}>{(a) => <input {...a} type="time" className="field-input" value={f.check_out_time} onChange={(e) => setF({ ...f, check_out_time: e.target.value })} />}</Field>
        <Field label={t('hotel.setup.advance')} hint={t('hotel.setup.advanceHint')} error={errors.advance_percent}>
          {(a) => <select {...a} className="field-input" value={f.advance_percent} onChange={(e) => setF({ ...f, advance_percent: Number(e.target.value) })}>{[0, 10, 20, 25, 30, 50, 100].map((p) => <option key={p} value={p}>{p ? `${p}%` : t('hotel.setup.payAtHotel')}</option>)}</select>}
        </Field>
        {num('free_cancel_days', t('hotel.setup.freeCancel'), { min: 0, max: 60 })}
        {num('max_nights', t('hotel.setup.maxNights'), { min: 1, max: 90 })}
        {num('max_days_ahead', t('hotel.setup.maxDaysAhead'), { min: 7, max: 540 })}
        {num('hold_minutes', t('hotel.setup.holdMinutes'), { min: 10, max: 120 })}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('hotel.setup.houseRules')} optional error={errors.house_rules}>{(a) => <textarea {...a} rows={3} className="field-input" maxLength={2000} value={f.house_rules ?? ''} onChange={(e) => setF({ ...f, house_rules: e.target.value })} />}</Field>
        <Field label={t('hotel.setup.houseRulesHi')} optional>{(a) => <textarea {...a} rows={3} className="field-input" lang="hi" maxLength={2000} value={f.house_rules_hi ?? ''} onChange={(e) => setF({ ...f, house_rules_hi: e.target.value })} />}</Field>
      </div>
      <div className="rounded-xl border border-ink/10 p-4">
        <Toggle checked={f.id_documents} onChange={(v) => setF({ ...f, id_documents: v })} label={t('hotel.setup.idDocs')} hint={t('hotel.setup.idDocsHint')} />
        {f.id_documents && (
          <>
            <Alert tone="warn">{t('hotel.setup.idDocsWarn')}</Alert>
            <div className="mt-3 max-w-xs">{num('id_keep_days', t('hotel.setup.idKeepDays'), { min: 1, max: 365 })}</div>
          </>
        )}
      </div>
      <div className="flex justify-end"><button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button></div>
    </section>
  );
}

const blankType = { name: '', name_hi: '', description: '', description_hi: '', amenities: [] as string[], bed: '', size_sqft: '', base_occupancy: '2', max_adults: '2', max_children: '1', base_price: '', weekend_price: '', extra_adult_price: '', extra_child_price: '', is_active: true };

function TypeDialog({ type, onClose }: { type: RoomTypeRow | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const ty = type === 'new' ? null : type;
  const [f, setF] = useState(blankType);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!type) return;
    setErrors({});
    setF(ty ? {
      name: ty.name, name_hi: ty.name_hi ?? '', description: ty.description ?? '', description_hi: ty.description_hi ?? '', amenities: ty.amenities, bed: ty.bed ?? '', size_sqft: ty.size_sqft ? String(ty.size_sqft) : '',
      base_occupancy: String(ty.base_occupancy), max_adults: String(ty.max_adults), max_children: String(ty.max_children), base_price: String(Number(ty.base_price)), weekend_price: ty.weekend_price ? String(Number(ty.weekend_price)) : '',
      extra_adult_price: Number(ty.extra_adult_price) ? String(Number(ty.extra_adult_price)) : '', extra_child_price: Number(ty.extra_child_price) ? String(Number(ty.extra_child_price)) : '', is_active: ty.is_active,
    } : blankType);
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation<RoomTypeRow, ApiError>({
    mutationFn: async () => {
      const n = (v: string) => (v === '' ? null : Number(v));
      const body = { ...f, size_sqft: n(f.size_sqft), base_occupancy: Number(f.base_occupancy), max_adults: Number(f.max_adults), max_children: Number(f.max_children), base_price: n(f.base_price), weekend_price: n(f.weekend_price), extra_adult_price: n(f.extra_adult_price) ?? 0, extra_child_price: n(f.extra_child_price) ?? 0 };
      return (ty ? await api.put<RoomTypeRow>(`/tenant/hotel/types/${ty.id}`, body) : await api.post<RoomTypeRow>('/tenant/hotel/types', body)).data;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hotel'] }); toast.success(t('common.saved')); onClose(); },
    onError: (e) => setErrors(errorsOf(e)),
  });
  if (!type) return null;
  const text = (k: keyof typeof blankType, label: string, props: Record<string, unknown> = {}, optional = false) => (
    <Field label={label} optional={optional} error={errors[k]}>{(a) => <input {...a} className="field-input" {...props} value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</Field>
  );
  return (
    <Dialog open onClose={onClose} title={ty ? t('hotel.setup.editType', { name: ty.name }) : t('hotel.setup.newType')} wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        {errors.form && <Alert>{errors.form}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {text('name', t('hotel.setup.typeName'), { maxLength: 80, placeholder: t('hotel.setup.typeNameHint') })}
          {text('name_hi', t('hotel.setup.typeNameHi'), { maxLength: 80, lang: 'hi' }, true)}
          <Field label={t('hotel.setup.description')} optional error={errors.description}>{(a) => <textarea {...a} rows={3} className="field-input" maxLength={1500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
          <Field label={t('hotel.setup.descriptionHi')} optional>{(a) => <textarea {...a} rows={3} className="field-input" lang="hi" maxLength={1500} value={f.description_hi} onChange={(e) => setF({ ...f, description_hi: e.target.value })} />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {text('base_price', t('hotel.setup.basePrice'), { type: 'number', min: 1 })}
          {text('weekend_price', t('hotel.setup.weekendPrice'), { type: 'number', min: 1 }, true)}
          {text('extra_adult_price', t('hotel.setup.extraAdult'), { type: 'number', min: 0 }, true)}
          {text('extra_child_price', t('hotel.setup.extraChild'), { type: 'number', min: 0 }, true)}
          {text('base_occupancy', t('hotel.setup.included'), { type: 'number', min: 1, max: 20 })}
          {text('max_adults', t('hotel.setup.maxAdults'), { type: 'number', min: 1, max: 20 })}
          {text('max_children', t('hotel.setup.maxChildren'), { type: 'number', min: 0, max: 20 })}
          {text('size_sqft', t('hotel.setup.size'), { type: 'number', min: 50 }, true)}
        </div>
        <p className="text-xs text-muted">{t('hotel.setup.priceHint')}</p>
        {text('bed', t('hotel.setup.bed'), { maxLength: 60, placeholder: t('hotel.setup.bedHint') }, true)}
        <fieldset>
          <legend className="field-label">{t('hotel.setup.amenities')}</legend>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map((a) => {
              const on = f.amenities.includes(a);
              return <button key={a} type="button" aria-pressed={on} onClick={() => setF({ ...f, amenities: on ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] })} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-ink bg-ink text-paper' : 'border-ink/15'}`}>{t(`hotel.amenity.${a}`)}</button>;
            })}
          </div>
        </fieldset>
        <Toggle checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label={t('hotel.setup.onSale')} hint={t('hotel.setup.onSaleHint')} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

function Photos({ ty }: { ty: RoomTypeRow }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ['hotel', 'types'] });
  const upload = useMutation<unknown, ApiError, File>({
    mutationFn: (file) => {
      const form = new FormData();
      form.append('image', file);
      form.append('alt', ty.name);
      return api.post(`/tenant/hotel/types/${ty.id}/photos`, form);
    },
    onSuccess: done,
    onError: (e) => toast.error(e.message),
  });
  const act = useMutation<unknown, ApiError, { key: number; del: boolean }>({
    mutationFn: ({ key, del }) => (del ? api.delete(`/tenant/hotel/types/${ty.id}/photos/${key}`) : api.put(`/tenant/hotel/types/${ty.id}/photos/${key}`)),
    onSuccess: done,
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="flex flex-wrap gap-2">
      {ty.photos.map((p, i) => (
        <figure key={p.key} className="group relative h-20 w-28 overflow-hidden rounded-lg bg-ink/5">
          <img src={p.src} srcSet={p.srcset} sizes="112px" alt={p.alt} className="h-full w-full object-cover" />
          <figcaption className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-black/50 p-1">
            {i > 0 && <button type="button" className="rounded bg-white/90 p-1 text-[#14110f]" onClick={() => act.mutate({ key: p.key, del: false })} aria-label={t('hotel.setup.makeCover')}><Star className="h-3.5 w-3.5" aria-hidden="true" /></button>}
            <button type="button" className="rounded bg-white/90 p-1 text-[#b91c1c]" onClick={() => window.confirm(t('hotel.setup.confirmPhoto')) && act.mutate({ key: p.key, del: true })} aria-label={t('hotel.setup.removePhoto')}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </figcaption>
          {i === 0 && <span className="absolute left-1 top-1 rounded bg-white/90 px-1.5 text-[10px] font-bold text-[#14110f]">{t('hotel.setup.cover')}</span>}
        </figure>
      ))}
      {ty.photos.length < 8 && (
        <label className="flex h-20 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-ink/20 text-xs font-semibold text-muted hover:border-ink/40">
          {upload.isPending ? <Spinner /> : <ImagePlus className="h-5 w-5" aria-hidden="true" />}
          {t('hotel.setup.addPhoto')}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={upload.isPending} onChange={(e) => { const file = e.target.files?.[0]; if (file) upload.mutate(file); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}

function Rates({ ty }: { ty: RoomTypeRow }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', starts_on: '', ends_on: '', price: '', weekend_price: '' });
  const [err, setErr] = useState('');
  const add = useMutation<unknown, ApiError>({
    mutationFn: () => api.post(`/tenant/hotel/types/${ty.id}/rates`, { ...f, price: Number(f.price), weekend_price: f.weekend_price ? Number(f.weekend_price) : null }),
    onSuccess: () => { setF({ name: '', starts_on: '', ends_on: '', price: '', weekend_price: '' }); setErr(''); void qc.invalidateQueries({ queryKey: ['hotel', 'types'] }); },
    onError: (e) => setErr(e.errors ? Object.values(e.errors)[0][0] : e.message),
  });
  const remove = useMutation<unknown, ApiError, number>({
    mutationFn: (id) => api.delete(`/tenant/hotel/rates/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['hotel', 'types'] }),
  });
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{t('hotel.setup.seasons')}</p>
      {ty.rates.length ? (
        <ul className="space-y-1 text-sm">
          {ty.rates.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span><b>{r.name}</b> · {shortDate(r.starts_on)} – {shortDate(r.ends_on)} · {formatMoney(r.price)}{r.weekend_price && ` / ${formatMoney(r.weekend_price)} ${t('hotel.setup.weekendShort')}`}</span>
              <button type="button" className="btn-ghost !min-h-8 !px-1.5 text-danger" onClick={() => remove.mutate(r.id)} aria-label={t('hotel.setup.removeSeason', { name: r.name })}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-muted">{t('hotel.setup.noSeasons')}</p>}
      <form className="grid grid-cols-2 gap-2 sm:grid-cols-6" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <input className="field-input !py-2 sm:col-span-2" aria-label={t('hotel.setup.seasonName')} placeholder={t('hotel.setup.seasonName')} maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="field-input !py-2" type="date" aria-label={t('hotel.setup.from')} value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} />
        <input className="field-input !py-2" type="date" aria-label={t('hotel.setup.to')} min={f.starts_on} value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} />
        <input className="field-input !py-2" type="number" min={1} aria-label={t('hotel.setup.seasonPrice')} placeholder={t('hotel.setup.seasonPrice')} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        <button type="submit" className="btn-outline !min-h-10 text-sm" disabled={add.isPending || !f.name || !f.starts_on || !f.ends_on || !f.price}><Plus className="h-4 w-4" aria-hidden="true" /> {t('hotel.setup.addSeason')}</button>
      </form>
      {err && <p className="field-error">{err}</p>}
    </div>
  );
}

function useQr(url: string, width = 300) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(url, { width, margin: 2, color: { dark: '#14110f', light: '#ffffff' } }).then((s) => alive && setSrc(s));
    return () => { alive = false; };
  }, [url, width]);
  return src;
}

function QrCard({ room, business }: { room: RoomRow; business: string }) {
  const { t } = useTranslation();
  const src = useQr(room.qr_url);
  return (
    <div className="qr-card flex flex-col items-center rounded-2xl border border-ink/20 p-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest">{business}</p>
      <p className="mt-1 text-3xl font-extrabold">{t('hotel.roomNo', { number: room.number })}</p>
      {src && <img src={src} alt="" className="mt-3 h-48 w-48" />}
      <p className="mt-3 text-base font-semibold">{t('hotel.setup.qrScan')}</p>
      <p className="mt-1 text-xs">{t('hotel.setup.qrHint')}</p>
    </div>
  );
}

function RoomsCard({ types, business }: { types: RoomTypeRow[]; business: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useRooms();
  const [add, setAdd] = useState({ room_type_id: '', numbers: '', floor: '' });
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<RoomRow | null>(null);
  const done = () => void qc.invalidateQueries({ queryKey: ['hotel'] });
  const create = useMutation<unknown, ApiError>({
    mutationFn: () => api.post('/tenant/hotel/rooms', { room_type_id: Number(add.room_type_id || types[0]?.id), numbers: add.numbers, floor: add.floor || null }),
    onSuccess: () => { setAdd({ ...add, numbers: '' }); setErr(''); done(); toast.success(t('hotel.setup.roomsAdded')); },
    onError: (e) => setErr(e.errors ? Object.values(e.errors)[0][0] : e.message),
  });
  const update = useMutation<unknown, ApiError, RoomRow>({
    mutationFn: (r) => api.put(`/tenant/hotel/rooms/${r.id}`, { number: r.number, room_type_id: r.room_type_id, floor: r.floor, is_active: r.is_active }),
    onSuccess: () => { setEditing(null); done(); },
    onError: (e) => toast.error(e.errors ? Object.values(e.errors)[0][0] : e.message),
  });
  const remove = useMutation<unknown, ApiError, RoomRow>({
    mutationFn: (r) => api.delete(`/tenant/hotel/rooms/${r.id}`),
    onSuccess: done,
    onError: (e) => toast.error(e.message),
  });
  const qr = useMutation<unknown, ApiError, RoomRow>({
    mutationFn: (r) => api.post(`/tenant/hotel/rooms/${r.id}/qr`),
    onSuccess: () => { done(); toast.success(t('hotel.setup.newQr')); },
  });
  const rooms = q.data ?? [];
  return (
    <section className="card space-y-4 p-5" aria-labelledby="hr-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="hr-h" className="text-lg font-bold">{t('hotel.setup.rooms')} <span className="text-muted">({rooms.length})</span></h2>
        <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => window.print()} disabled={!rooms.some((r) => r.is_active)}><Printer className="h-4 w-4" aria-hidden="true" /> {t('hotel.setup.printQr')}</button>
      </div>
      {!types.length ? <p className="text-sm text-muted">{t('hotel.setup.typesFirst')}</p> : (
        <form className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <select className="field-input" aria-label={t('hotel.roomType')} value={add.room_type_id || String(types[0]?.id ?? '')} onChange={(e) => setAdd({ ...add, room_type_id: e.target.value })}>{types.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}</select>
          <input className="field-input" aria-label={t('hotel.setup.numbers')} placeholder={t('hotel.setup.numbersHint')} value={add.numbers} onChange={(e) => setAdd({ ...add, numbers: e.target.value })} />
          <input className="field-input" aria-label={t('hotel.setup.floorLabel')} placeholder={t('hotel.setup.floorLabel')} maxLength={20} value={add.floor} onChange={(e) => setAdd({ ...add, floor: e.target.value })} />
          <button type="submit" className="btn-primary" disabled={!add.numbers.trim() || create.isPending}><Plus className="h-4 w-4" aria-hidden="true" /> {t('hotel.setup.addRooms')}</button>
        </form>
      )}
      {err && <p className="field-error">{err}</p>}
      {q.isLoading && <SkeletonRows rows={3} />}
      {!!rooms.length && (
        <ul className="divide-y divide-ink/5">
          {rooms.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              {editing?.id === r.id ? (
                <form className="flex flex-1 flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); update.mutate(editing); }}>
                  <input className="field-input !w-24 !py-2" aria-label={t('hotel.setup.number')} value={editing.number} onChange={(e) => setEditing({ ...editing, number: e.target.value })} />
                  <select className="field-input !w-auto !py-2" aria-label={t('hotel.roomType')} value={editing.room_type_id} onChange={(e) => setEditing({ ...editing, room_type_id: Number(e.target.value) })}>{types.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}</select>
                  <input className="field-input !w-24 !py-2" aria-label={t('hotel.setup.floorLabel')} value={editing.floor ?? ''} onChange={(e) => setEditing({ ...editing, floor: e.target.value })} />
                  <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> {t('hotel.setup.inUse')}</label>
                  <button type="submit" className="btn-primary !min-h-10 text-sm">{t('common.save')}</button>
                  <button type="button" className="btn-ghost !min-h-10 text-sm" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
                </form>
              ) : (
                <>
                  <span><b>{r.number}</b> <span className="text-sm text-muted">· {r.type}{r.floor ? ` · ${t('hotel.floor', { floor: r.floor })}` : ''}</span> {!r.is_active && <Badge tone="cancelled">{t('hotel.setup.notInUse')}</Badge>}</span>
                  <span className="flex gap-1">
                    <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={() => window.confirm(t('hotel.setup.confirmQr')) && qr.mutate(r)} aria-label={t('hotel.setup.regenQr', { number: r.number })}><RefreshCw className="h-4 w-4" aria-hidden="true" /></button>
                    <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={() => setEditing(r)} aria-label={t('hotel.setup.editRoom', { number: r.number })}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                    <button type="button" className="btn-ghost !min-h-9 !px-2 text-danger" onClick={() => window.confirm(t('hotel.setup.confirmRoom', { number: r.number })) && remove.mutate(r)} aria-label={t('hotel.setup.removeRoom', { number: r.number })}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* Print sheet: only this shows when printing (two cards across). */}
      <style>{'@media print { body * { visibility: hidden !important; } #room-qr-sheet, #room-qr-sheet * { visibility: visible !important; } #room-qr-sheet { position: absolute; top: 0; left: 0; width: 100%; display: grid !important; } .qr-card { break-inside: avoid; } @page { margin: 12mm; } }'}</style>
      <div id="room-qr-sheet" className="hidden grid-cols-2 gap-6" aria-hidden="true">
        {rooms.filter((r) => r.is_active).map((r) => <QrCard key={r.id} room={r} business={business} />)}
      </div>
    </section>
  );
}

export default function Setup() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const types = useRoomTypes();
  const [editing, setEditing] = useState<RoomTypeRow | 'new' | null>(null);
  const session = useSession().data;
  const remove = useMutation<unknown, ApiError, RoomTypeRow>({
    mutationFn: (ty) => api.delete(`/tenant/hotel/types/${ty.id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['hotel'] }),
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="space-y-5">
      <section className="card space-y-4 p-5" aria-labelledby="ht-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ht-h" className="text-lg font-bold">{t('hotel.setup.types')}</h2>
          <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" /> {t('hotel.setup.newType')}</button>
        </div>
        {types.isLoading && <SkeletonRows rows={3} />}
        {types.isError && <ErrorState message={(types.error as Error).message} onRetry={() => void types.refetch()} />}
        {types.data && !types.data.length && <EmptyState title={t('hotel.setup.noTypes')}>{t('hotel.setup.noTypesHint')}</EmptyState>}
        <ul className="space-y-4">
          {types.data?.map((ty) => (
            <li key={ty.id} className="space-y-3 rounded-xl border border-ink/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{ty.name} {!ty.is_active && <Badge tone="cancelled">{t('hotel.setup.offSale')}</Badge>}</p>
                  <p className="text-sm text-muted">
                    {formatMoney(ty.base_price)}{ty.weekend_price && ` · ${formatMoney(ty.weekend_price)} ${t('hotel.setup.weekendShort')}`} · {t('hotel.setup.sleeps', { adults: ty.max_adults, children: ty.max_children })} · {t('hotel.setup.roomCount', { count: ty.rooms_count })}
                  </p>
                </div>
                <span className="flex gap-1">
                  <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={() => setEditing(ty)} aria-label={t('hotel.setup.editType', { name: ty.name })}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" className="btn-ghost !min-h-9 !px-2 text-danger" onClick={() => window.confirm(t('hotel.setup.confirmType', { name: ty.name })) && remove.mutate(ty)} aria-label={t('hotel.setup.removeType', { name: ty.name })}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </span>
              </div>
              <Photos ty={ty} />
              <Rates ty={ty} />
            </li>
          ))}
        </ul>
      </section>
      <RoomsCard types={types.data ?? []} business={session?.tenant?.name ?? ''} />
      <SettingsCard />
      <TypeDialog type={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
