import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import { Dialog, Toggle } from '@/components/ui';
import { kotSlip, printSlip, setPrinterPrefs, slipDocument, usePrinterPrefs } from '@/lib/print';

/** "Printer" button + settings for this device's receipt printer (POS and kitchen screen). */
export function PrinterButton({ business, className = 'btn-ghost !min-h-10 text-sm', showKot = true, showBill = true }: { business: string; className?: string; showKot?: boolean; showBill?: boolean }) {
  const { t, i18n } = useTranslation();
  const prefs = usePrinterPrefs();
  const [open, setOpen] = useState(false);
  const test = () =>
    printSlip(
      slipDocument(
        kotSlip({ business, order: null, kot: null, type: 'takeaway', table: null, at: new Date(), items: [{ quantity: 1, name: t('print.testLine'), detail: `${prefs.width} mm` }] }, t, i18n.language ?? 'en'),
        prefs.width,
        t('print.test'),
      ),
    );

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Printer className="h-4 w-4" aria-hidden="true" /> {t('print.printer')}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('print.settings')}>
        <div className="space-y-5">
          <fieldset>
            <legend className="field-label">{t('print.paper')}</legend>
            <div className="flex gap-2">
              {([58, 80] as const).map((w) => (
                <label key={w} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border font-semibold ${prefs.width === w ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                  <input type="radio" name="paper" className="sr-only" checked={prefs.width === w} onChange={() => setPrinterPrefs({ width: w })} />
                  {w} mm
                </label>
              ))}
            </div>
          </fieldset>
          <div className="divide-y divide-line">
            {showKot && <Toggle checked={prefs.autoKot} onChange={(v) => setPrinterPrefs({ autoKot: v })} label={t('print.autoKot')} hint={t('print.autoKotHint')} />}
            {showBill && <Toggle checked={prefs.autoBill} onChange={(v) => setPrinterPrefs({ autoBill: v })} label={t('print.autoBill')} hint={t('print.autoBillHint')} />}
          </div>
          <p className="rounded-xl bg-paper p-3 text-sm text-muted">{t('print.howTo')}</p>
          <button type="button" className="btn-outline w-full" onClick={test}>
            <Printer className="h-4 w-4" aria-hidden="true" /> {t('print.test')}
          </button>
        </div>
      </Dialog>
    </>
  );
}
