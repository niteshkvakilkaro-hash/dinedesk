import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { Holiday } from '@/lib/openStatus';

/** Whole-day closures (festivals, renovation...). The website shows "Closed today" on these dates. */
export function HolidaysEditor({ value, onChange }: { value: Holiday[]; onChange: (v: Holiday[]) => void }) {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = value.filter((h) => h.date >= today);
  const past = value.length - upcoming.length;

  const add = () => {
    if (!date || value.some((h) => h.date === date)) return;
    onChange([...value, { date, label: label.trim() || null }].sort((a, b) => a.date.localeCompare(b.date)));
    setDate('');
    setLabel('');
  };

  return (
    <fieldset>
      <legend className="field-label">{t('holidays.title')}</legend>
      <p className="-mt-1 mb-3 text-sm text-muted">{t('holidays.hint')}</p>
      {upcoming.length > 0 && (
        <ul className="mb-3 divide-y divide-line rounded-xl border border-line">
          {upcoming.map((h) => (
            <li key={h.date} className="flex items-center gap-3 px-3 py-1.5">
              <span className="font-mono text-sm">{h.date}</span>
              <span className="flex-1 text-sm">{h.label}</span>
              <button type="button" className="btn-ghost !min-h-10 !px-2.5 text-danger" onClick={() => onChange(value.filter((x) => x.date !== h.date))}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t('holidays.remove', { date: h.date })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {past > 0 && <p className="mb-3 text-xs text-muted">{t('holidays.past', { count: past })}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-semibold">{t('holidays.date')}</span>
          <input type="date" min={today} className="field-input !w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="min-w-40 flex-1 text-sm">
          <span className="mb-1 block font-semibold">
            {t('holidays.label')} <span className="font-normal text-muted">({t('common.optional')})</span>
          </span>
          <input className="field-input" maxLength={60} placeholder={t('holidays.placeholder')} value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <button type="button" className="btn-outline" disabled={!date} onClick={add}>
          <Plus className="h-4 w-4" aria-hidden="true" /> {t('common.add')}
        </button>
      </div>
    </fieldset>
  );
}
