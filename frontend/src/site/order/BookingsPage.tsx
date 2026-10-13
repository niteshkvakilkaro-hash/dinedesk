import { useState } from 'react';
import { intlLocale } from '@/i18n/locale';
import { Link } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BedDouble, CalendarCheck, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useGuestAccount } from '../account';
import { rememberedStays, type GuestStay } from '../hotel';
import { rememberedBookings } from '../reservations';
import { useMoney } from '../ordering';
import type { SiteData } from '../types';
import { useSkin } from './skin';

/**
 * "My bookings": room stays and table bookings made from this device, plus (when signed in
 * with the phone number) those made from any device. Each opens its own manage page.
 */
export default function BookingsPage({ site }: { site: SiteData }) {
  const { t, i18n } = useTranslation();
  const skin = useSkin();
  const money = useMoney();
  const me = useGuestAccount().data;
  const hasRooms = !!site.hotel?.has_rooms;
  const hasTables = !!site.reservations?.enabled;
  const [tab, setTab] = useState<'rooms' | 'tables'>(hasRooms ? 'rooms' : 'tables');
  const host = window.location.host;

  // Rooms: the account's stays, then this device's (details fetched for those).
  const accountStays = me?.stays ?? [];
  const localStays = rememberedStays(host).filter((s) => !accountStays.some((a) => a.id === s.id));
  const fetched = useQueries({
    queries: localStays.map((s) => ({
      queryKey: ['site', 'stay', s.id, s.token],
      queryFn: async () => (await api.get<GuestStay>(`/site/hotel/bookings/${s.id}`, { t: s.token })).data,
      retry: false,
      staleTime: 60_000,
    })),
  });
  const stays = [
    ...accountStays.map((s) => ({ id: s.id, token: s.token, code: s.code, type: s.room_type, from: s.check_in, to: s.check_out, guests: s.guests, status: s.status, total: s.total })),
    ...localStays.flatMap((s, i) => {
      const d = fetched[i].data;
      return d ? [{ id: s.id, token: s.token, code: d.code, type: d.room_type.name, from: d.check_in, to: d.check_out, guests: d.adults + d.children, status: d.status, total: d.total }] : [];
    }),
  ];

  // Tables: the account's, then codes remembered on this device.
  const accountTables = me?.tables ?? [];
  const tables = [
    ...accountTables.map((r) => ({ ...r, phone: me?.phone ?? '' })),
    ...rememberedBookings(host)
      .filter((b) => !accountTables.some((a) => a.code === b.code))
      .map((b) => ({ code: b.code, phone: b.phone, date: null as string | null, time: null as string | null, party: null as number | null, status: null as string | null })),
  ];

  const day = (d: string) => new Intl.DateTimeFormat(intlLocale(i18n.language), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
  const status = (s: string) => t(`site.profile.status.${s}`, { defaultValue: s });

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className={`text-4xl ${skin.heading}`}>{t('site.profile.bookings')}</h1>
      {!me && <p className="mt-2 text-t-muted">{t('site.profile.bookingsLead')}</p>}

      {hasRooms && hasTables && (
        <div className="mt-6 flex gap-1 rounded-full bg-black/5 p-1" role="tablist">
          {(['rooms', 'tables'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? `${skin.primary}` : ''}`}>
              {t(`site.profile.tab.${k}`)}
            </button>
          ))}
        </div>
      )}

      {tab === 'rooms' && hasRooms && (
        <ul className="mt-6 space-y-3">
          {stays.length === 0 && <Empty to="/rooms" label={t('site.profile.noStays')} cta={t('site.profile.bookRoom')} />}
          {stays.map((s) => (
            <li key={s.id}>
              <Link to={`/stay/${s.id}?t=${encodeURIComponent(s.token)}`} className={`flex items-center gap-4 p-4 ${skin.card}`}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-t-primary text-t-on-primary">
                  <BedDouble className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{s.type}</span>
                  <span className="block text-sm text-t-muted">
                    {day(s.from)} – {day(s.to)} · {t('site.profile.guests', { count: s.guests })} · #{s.code}
                  </span>
                  <span className="mt-1 inline-block rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-bold">{status(s.status)}</span>
                </span>
                <span className="text-right text-sm font-bold tabular-nums">{money(Number(s.total))}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-t-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {tab === 'tables' && hasTables && (
        <ul className="mt-6 space-y-3">
          {tables.length === 0 && <Empty to="/reserve" label={t('site.profile.noTables')} cta={t('site.reserveTitle')} />}
          {tables.map((r) => (
            <li key={r.code}>
              <Link to={`/reservation?code=${encodeURIComponent(r.code)}&phone=${encodeURIComponent(r.phone)}`} className={`flex items-center gap-4 p-4 ${skin.card}`}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-t-primary text-t-on-primary">
                  <CalendarCheck className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    {r.date ? `${day(r.date)} · ${r.time}` : t('site.profile.tableBooking')}
                  </span>
                  <span className="block text-sm text-t-muted">
                    {r.party ? `${t('site.profile.guests', { count: r.party })} · ` : ''}#{r.code}
                  </span>
                  {r.status && <span className="mt-1 inline-block rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-bold">{status(r.status)}</span>}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-t-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  function Empty({ to, label, cta }: { to: string; label: string; cta: string }) {
    return (
      <li className={`flex flex-col items-center gap-3 p-8 text-center ${skin.card}`}>
        <p>{label}</p>
        <Link to={to} className={`inline-flex min-h-12 items-center px-6 ${skin.primary}`}>
          {cta}
        </Link>
      </li>
    );
  }
}
