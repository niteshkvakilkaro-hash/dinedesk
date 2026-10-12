import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download, FileSpreadsheet } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Alert, SkeletonRows, toast } from '@/components/ui';

interface Gst {
  month: string;
  gstin: string | null;
  totals: { taxable: string; cgst: string; sgst: string; tax: string };
  bills: { count: number; void: number; b2b: number };
  unbilled: { orders: number; taxable: string; tax: string };
  b2cs: { rate: number; taxable: string; cgst: string; sgst: string }[];
  ledgers: string[];
}

const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);

/** The month's GST in GSTR-1 shape for the CA, and Tally Prime vouchers. */
export function GstPanel() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(thisMonth);
  const q = useQuery({ queryKey: ['gst', month], queryFn: async () => (await api.get<Gst>('/tenant/reports/gst', { month })).data });
  const get = (section: string) => void downloadFile(`/tenant/reports/gst/export/${section}`, section === 'tally' ? `tally-sales-${month}.xml` : `gstr1-${section}-${month}.csv`, { month }).catch((e: Error) => toast.error(e.message));
  const g = q.data;

  return (
    <section className="card space-y-4 p-5" aria-labelledby="gst-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="gst-h" className="flex items-center gap-2 text-lg font-bold">
            <FileSpreadsheet className="h-5 w-5" aria-hidden="true" /> {t('gst.title')}
          </h2>
          <p className="text-sm text-muted">{t('gst.lead')}</p>
        </div>
        <input type="month" className="field-input !w-auto !py-1.5" aria-label={t('gst.month')} max={thisMonth()} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      {q.isLoading && <SkeletonRows rows={3} />}
      {g && (
        <>
          {!g.gstin && <Alert tone="warn">{t('gst.noGstin')}</Alert>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [t('gst.taxable'), formatMoney(g.totals.taxable)],
              ['CGST', formatMoney(g.totals.cgst)],
              ['SGST', formatMoney(g.totals.sgst)],
              [t('gst.bills'), t('gst.billsValue', { count: g.bills.count, b2b: g.bills.b2b, void: g.bills.void })],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-paper p-3">
                <p className="text-xs font-semibold text-muted">{label}</p>
                <p className="mt-0.5 font-extrabold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          {g.unbilled.orders > 0 && <Alert tone="info">{t('gst.unbilled', { count: g.unbilled.orders, taxable: formatMoney(g.unbilled.taxable), tax: formatMoney(g.unbilled.tax) })}</Alert>}
          {g.b2cs.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-xs">
              {g.b2cs.map((r) => (
                <li key={r.rate} className="rounded-full bg-ink/5 px-2.5 py-1">
                  {t('gst.rateLine', { rate: r.rate, taxable: formatMoney(r.taxable) })}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {(['b2b', 'b2cs', 'hsn', 'docs'] as const).map((s) => (
              <button key={s} type="button" className="btn-outline !min-h-10 text-sm" onClick={() => get(s)}>
                <Download className="h-4 w-4" aria-hidden="true" /> {t(`gst.section.${s}`)}
              </button>
            ))}
            <button type="button" className="btn-primary !min-h-10 text-sm" onClick={() => get('tally')}>
              <Download className="h-4 w-4" aria-hidden="true" /> {t('gst.tally')}
            </button>
          </div>
          <p className="text-xs text-muted">{t('gst.tallyNote', { ledgers: g.ledgers.join(', ') })}</p>
          <p className="text-xs text-muted">{t('gst.caNote')}</p>
        </>
      )}
    </section>
  );
}
