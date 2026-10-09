import { useTranslation } from 'react-i18next';
import { Copy } from 'lucide-react';
import type { DayKey, OpeningHours } from '@/types';

export const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const defaultHours = (): OpeningHours =>
  Object.fromEntries(DAYS.map((d) => [d, { closed: false, open: '11:00', close: '23:00' }])) as OpeningHours;

/** Returns per-day error messages (empty object when valid). */
export function validateHours(hours: OpeningHours, t: (k: string) => string): Partial<Record<DayKey, string>> {
  const errors: Partial<Record<DayKey, string>> = {};
  for (const d of DAYS) {
    const h = hours[d];
    if (h.closed) continue;
    if (!h.open || !h.close) errors[d] = t('onboarding.validation.time');
    else if (h.open === h.close) errors[d] = t('onboarding.validation.sameTime');
  }
  return errors;
}

export function HoursEditor({ value, onChange, errors = {} }: { value: OpeningHours; onChange: (v: OpeningHours) => void; errors?: Partial<Record<DayKey, string>> }) {
  const { t } = useTranslation();
  const set = (day: DayKey, patch: Partial<OpeningHours[DayKey]>) => {
    const current = value[day];
    const next = { ...current, ...patch };
    if (patch.closed === false) {
      next.open = current.open ?? '11:00';
      next.close = current.close ?? '23:00';
    }
    onChange({ ...value, [day]: next });
  };

  return (
    <fieldset>
      <legend className="field-label">{t('onboarding.hours')}</legend>
      <p className="-mt-1 mb-3 text-sm text-muted">{t('onboarding.hoursHint')}</p>
      <div className="divide-y divide-line rounded-xl border border-line">
        {DAYS.map((day) => {
          const h = value[day];
          return (
            <div key={day} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <span className="w-24 font-semibold">{t(`days.${day}`)}</span>
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[var(--dd-ink)]" checked={!h.closed} onChange={(e) => set(day, { closed: !e.target.checked })} />
                {h.closed ? t('onboarding.closed') : t('onboarding.openAt')}
              </label>
              {!h.closed && (
                <span className="flex items-center gap-2">
                  <input type="time" aria-label={`${t(`days.${day}`)} ${t('onboarding.openAt')}`} className="field-input !w-[7.5rem] !py-1.5" value={h.open ?? ''} onChange={(e) => set(day, { open: e.target.value })} aria-invalid={Boolean(errors[day])} />
                  <span className="text-muted">–</span>
                  <input type="time" aria-label={`${t(`days.${day}`)} ${t('onboarding.closeAt')}`} className="field-input !w-[7.5rem] !py-1.5" value={h.close ?? ''} onChange={(e) => set(day, { close: e.target.value })} aria-invalid={Boolean(errors[day])} />
                </span>
              )}
              {errors[day] && (
                <span className="field-error !mt-0 w-full" role="alert">
                  {errors[day]}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="btn-ghost mt-2 !min-h-9 !px-3 text-sm" onClick={() => onChange(Object.fromEntries(DAYS.map((d) => [d, { ...value.mon }])) as OpeningHours)}>
        <Copy className="h-4 w-4" aria-hidden="true" /> {t('onboarding.copyToAll')}
      </button>
    </fieldset>
  );
}
