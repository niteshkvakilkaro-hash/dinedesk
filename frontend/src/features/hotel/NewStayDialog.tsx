import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatMoney, isIndianMobile } from '@/lib/format';
import { Alert, Dialog, Field, Spinner, toast } from '@/components/ui';
import { addDays, FOLIO_MODES, todayIst, type DeskAvailability, type StayDetail } from './api';

const SOURCES = ['phone', 'walk_in', 'email', 'other'] as const;

/** A booking taken at the desk (phone, walk-in): find a free room type, then the guest's details. */
export function NewStayDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const today = todayIst();
  const [search, setSearch] = useState({ check_in: today, check_out: addDays(today, 1), adults: '2', children: '0' });
  const [asked, setAsked] = useState<typeof search | null>(null);
  const [pick, setPick] = useState<{ type: number | null; room: string }>({ type: null, room: '' });
  const [g, setG] = useState({ name: '', phone: '', email: '', source: 'walk_in', requests: '', staff_note: '', advance_mode: 'cash', advance: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const s = { check_in: today, check_out: addDays(today, 1), adults: '2', children: '0' };
    setSearch(s);
    setAsked(null);
    setPick({ type: null, room: '' });
    setG({ name: '', phone: '', email: '', source: 'walk_in', requests: '', staff_note: '', advance_mode: 'cash', advance: '' });
    setErrors({});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const avail = useQuery({
    queryKey: ['hotel', 'desk-availability', asked],
    queryFn: async () => (await api.get<DeskAvailability[]>('/tenant/hotel/availability', asked!)).data,
    enabled: !!asked,
  });
  const chosen = avail.data?.find((x) => x.id === pick.type);

  const save = useMutation<StayDetail, ApiError>({
    mutationFn: async () => (await api.post<StayDetail>('/tenant/hotel/bookings', {
      room_type_id: pick.type,
      room_id: pick.room ? Number(pick.room) : null,
      check_in: asked!.check_in,
      check_out: asked!.check_out,
      adults: Number(asked!.adults),
      children: Number(asked!.children),
      name: g.name,
      phone: g.phone,
      email: g.email || null,
      source: g.source,
      requests: g.requests || null,
      staff_note: g.staff_note || null,
      advance: Number(g.advance) > 0 ? { mode: g.advance_mode, amount: Number(g.advance) } : null,
    })).data,
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ['hotel'] });
      toast.success(t('hotel.saved', { code: s.code }));
      onCreated(s.id);
    },
    onError: (e) => setErrors(e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])) : { form: e.message }),
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (g.name.trim().length < 2) e.name = t('order.err.name');
    if (!isIndianMobile(g.phone)) e.phone = t('order.err.phone');
    setErrors(e);
    if (!Object.keys(e).length) save.mutate();
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('hotel.newStay')} wide>
      <div className="space-y-5">
        <form className="grid grid-cols-2 gap-3 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); setPick({ type: null, room: '' }); setAsked({ ...search }); }}>
          <Field label={t('hotel.checkIn')}>{(a) => <input {...a} type="date" className="field-input" min={today} value={search.check_in} onChange={(e) => setSearch({ ...search, check_in: e.target.value, check_out: e.target.value >= search.check_out ? addDays(e.target.value, 1) : search.check_out })} />}</Field>
          <Field label={t('hotel.checkOut')}>{(a) => <input {...a} type="date" className="field-input" min={addDays(search.check_in, 1)} value={search.check_out} onChange={(e) => setSearch({ ...search, check_out: e.target.value })} />}</Field>
          <Field label={t('hotel.adultsLabel')}>{(a) => <input {...a} type="number" min={1} max={20} className="field-input" value={search.adults} onChange={(e) => setSearch({ ...search, adults: e.target.value })} />}</Field>
          <Field label={t('hotel.childrenLabel')}>{(a) => <input {...a} type="number" min={0} max={20} className="field-input" value={search.children} onChange={(e) => setSearch({ ...search, children: e.target.value })} />}</Field>
          <div className="flex items-end"><button type="submit" className="btn-outline w-full"><Search className="h-4 w-4" aria-hidden="true" /> {t('hotel.findRooms')}</button></div>
        </form>

        {avail.isFetching && <Spinner />}
        {avail.isError && <Alert>{(avail.error as Error).message}</Alert>}
        {avail.data && (
          <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <legend className="sr-only">{t('hotel.roomType')}</legend>
            {avail.data.map((ty) => {
              const can = ty.fits && ty.free > 0;
              return (
                <label key={ty.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${pick.type === ty.id ? 'border-ink bg-ink/[0.03]' : 'border-ink/10'} ${can ? '' : 'cursor-not-allowed opacity-50'}`}>
                  <input type="radio" name="room-type" className="mt-1" disabled={!can} checked={pick.type === ty.id} onChange={() => setPick({ type: ty.id, room: '' })} />
                  <span className="flex-1">
                    <span className="block font-semibold">{ty.name}</span>
                    <span className="block text-sm text-muted">{!ty.fits ? t('hotel.tooManyGuests') : ty.free > 0 ? t('hotel.freeRooms', { count: ty.free }) : t('hotel.soldOut')}</span>
                  </span>
                  {ty.quote && <span className="text-right"><span className="block font-bold">{formatMoney(ty.quote.total)}</span><span className="block text-xs text-muted">{t('hotel.inclGst', { value: formatMoney(ty.quote.tax_total) })}</span></span>}
                </label>
              );
            })}
          </fieldset>
        )}

        {chosen && (
          <form className="space-y-4 border-t border-ink/10 pt-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
            {errors.form && <Alert>{errors.form}</Alert>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('hotel.room')} optional hint={t('hotel.roomLaterHint')}>
                {(a) => <select {...a} className="field-input" value={pick.room} onChange={(e) => setPick({ ...pick, room: e.target.value })}><option value="">{t('hotel.assignLater')}</option>{chosen.free_rooms.map((r) => <option key={r.id} value={r.id}>{r.number} · {t(`hotel.hk.${r.housekeeping}`)}</option>)}</select>}
              </Field>
              <Field label={t('hotel.sourceLabel')}>{(a) => <select {...a} className="field-input" value={g.source} onChange={(e) => setG({ ...g, source: e.target.value })}>{SOURCES.map((s) => <option key={s} value={s}>{t(`hotel.source.${s}`)}</option>)}</select>}</Field>
              <Field label={t('order.name')} error={errors.name}>{(a) => <input {...a} className="field-input" maxLength={120} autoComplete="off" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} />}</Field>
              <Field label={t('order.phone')} error={errors.phone}>{(a) => <input {...a} type="tel" inputMode="tel" className="field-input" value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} />}</Field>
              <Field label={t('order.email')} optional error={errors.email}>{(a) => <input {...a} type="email" className="field-input" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} />}</Field>
              <Field label={t('hotel.requests')} optional>{(a) => <input {...a} className="field-input" maxLength={500} value={g.requests} onChange={(e) => setG({ ...g, requests: e.target.value })} />}</Field>
              <Field label={t('hotel.staffNote')} optional>{(a) => <input {...a} className="field-input" maxLength={500} value={g.staff_note} onChange={(e) => setG({ ...g, staff_note: e.target.value })} />}</Field>
              <div>
                <span className="field-label">{t('hotel.advance')} <span className="font-normal text-muted">({t('common.optional')})</span></span>
                <div className="flex gap-2">
                  <select className="field-input !w-auto" aria-label={t('hotel.mode.label')} value={g.advance_mode} onChange={(e) => setG({ ...g, advance_mode: e.target.value })}>{FOLIO_MODES.map((m) => <option key={m} value={m}>{t(`hotel.mode.${m}`)}</option>)}</select>
                  <input className="field-input" type="number" min={0} aria-label={t('hotel.amount')} placeholder="0" value={g.advance} onChange={(e) => setG({ ...g, advance: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm">{t('hotel.stayTotal', { nights: chosen.quote?.nights ?? 0, total: formatMoney(chosen.quote?.total) })}</p>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('hotel.saveStay')}</button>
              </div>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
