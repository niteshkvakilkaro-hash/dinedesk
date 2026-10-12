import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LogIn, LogOut, Timer } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Spinner, toast } from '@/components/ui';
import { clockTime, hm, shortTime, todayYmd } from './time';

interface Me {
  open: { clock_in: string } | null;
  minutes_today: number;
  shifts: { id: number; date: string; starts: string; ends: string; note: string | null }[];
}

/** Clock in / out from the dashboard home, with today's shift. */
export default function ClockCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['attendance-me'], queryFn: async () => (await api.get<Me>('/tenant/attendance/me')).data, refetchInterval: 60_000 });
  const clock = useMutation<Me, ApiError>({
    mutationFn: async () => (await api.post<Me>('/tenant/attendance/clock')).data,
    onSuccess: (me) => {
      qc.setQueryData(['attendance-me'], me);
      void qc.invalidateQueries({ queryKey: ['rota'] });
      toast.success(me.open ? t('rota.clockedIn') : t('rota.clockedOut'));
    },
    onError: (e) => toast.error(e.message),
  });
  if (!q.data) return null;
  const me = q.data;
  const today = todayYmd();
  const shift = me.shifts.find((s) => s.date === today);
  const next = shift ?? me.shifts[0];
  const worked = me.minutes_today;
  return (
    <section className="card flex flex-wrap items-center gap-4 p-4" aria-label={t('rota.clockTitle')}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${me.open ? 'bg-success-soft text-success' : 'bg-ink/5 text-muted'}`}><Timer className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{me.open ? t('rota.inSince', { time: clockTime(me.open.clock_in) }) : t('rota.notIn')}</p>
        <p className="text-sm text-muted">
          {next ? (next.date === today ? t('rota.todayShift', { from: shortTime(next.starts), to: shortTime(next.ends) }) : t('rota.nextShift', { date: new Date(`${next.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }), from: shortTime(next.starts), to: shortTime(next.ends) })) : t('rota.noShift')}
          {worked > 0 && <> · {t('rota.workedToday', { time: hm(worked) })}</>}
        </p>
      </div>
      <button type="button" className={me.open ? 'btn-ghost !min-h-10 border border-line text-sm' : 'btn-primary !min-h-10 text-sm'} onClick={() => clock.mutate()} disabled={clock.isPending}>
        {clock.isPending ? <Spinner /> : me.open ? <><LogOut className="h-4 w-4" aria-hidden="true" /> {t('rota.clockOut')}</> : <><LogIn className="h-4 w-4" aria-hidden="true" /> {t('rota.clockIn')}</>}
      </button>
    </section>
  );
}
