import { useState } from 'react';
import { intlLocale } from '@/i18n/locale';
import { useTranslation } from 'react-i18next';
import { CloudOff, RefreshCw, Trash2, Wifi } from 'lucide-react';
import { formatMoney as formatINR } from '@/lib/format';
import { esc, kotSlip, printerPrefs, printSlip, slipDocument } from '@/lib/print';
import { Alert, Dialog, Spinner, toast } from '@/components/ui';
import type { TicketLine } from './api';
import { addSale, dropSale, estimate, type OfflineMode, type OfflinePack, type OfflineSale } from './offline';

const MODES: OfflineMode[] = ['cash', 'upi', 'card'];

/** Status above the POS: offline notice, sales waiting to sync, and any that need a look. */
export function OfflineBar({ tenant, online, queue, waiting, syncing, onSync }: { tenant: string | number; online: boolean; queue: OfflineSale[]; waiting: number; syncing: boolean; onSync: () => void }) {
  const { t } = useTranslation();
  const problems = queue.filter((s) => s.state !== 'waiting');
  if (online && !queue.length) return null;
  return (
    <div className="space-y-2">
      {!online && (
        <div className="flex items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-warn">
          <CloudOff className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-semibold">{t('pos.offline.banner')}</p>
        </div>
      )}
      {waiting > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-ink/5 px-4 py-3">
          <p className="flex-1 text-sm font-semibold">{t('pos.offline.waiting', { count: waiting })}</p>
          <button type="button" className="btn-outline !min-h-9 text-sm" disabled={!online || syncing} onClick={onSync}>
            {syncing ? <Spinner className="h-4 w-4" /> : online ? <RefreshCw className="h-4 w-4" aria-hidden="true" /> : <Wifi className="h-4 w-4" aria-hidden="true" />} {online ? t('pos.offline.syncNow') : t('pos.offline.whenOnline')}
          </button>
        </div>
      )}
      {problems.length > 0 && (
        <ul className="space-y-1 rounded-2xl bg-danger-soft p-3 text-sm text-danger">
          {problems.map((s) => (
            <li key={s.ref} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">
                <strong>{s.summary}</strong> · {formatINR(s.total)} · {s.bill ? `${s.bill} · ` : ''}{s.message}
              </span>
              <button type="button" className="rounded-full p-1 hover:bg-danger/10" onClick={() => window.confirm(t('pos.offline.dropConfirm')) && dropSale(tenant, s.ref)} aria-label={t('pos.offline.drop')}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Takeaway / counter sale with no internet: take payment, print, keep it on this device. */
export function OfflineCharge({ tenant, business, lines, pack, customer, notes, onDone, onClose }: {
  tenant: string | number; business: string; lines: TicketLine[]; pack: OfflinePack | undefined;
  customer: { name: string; phone: string }; notes: string; onDone: () => void; onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<OfflineMode>('cash');
  const [received, setReceived] = useState('');
  if (!pack) {
    return (
      <Dialog open onClose={onClose} title={t('pos.offline.title')}>
        <Alert>{t('pos.offline.noPack')}</Alert>
      </Dialog>
    );
  }
  const { total, tax, packaging } = estimate(lines, pack);
  const rupees = total / 100;
  const cashIn = Number(received || 0);
  const change = mode === 'cash' ? cashIn - rupees : 0;
  const short = mode === 'cash' && received !== '' && cashIn < rupees;

  const save = () => {
    const sale = addSale(tenant, {
      items: lines.map((l) => ({ item_id: l.item_id, variant_id: l.variant_id, addon_ids: l.addon_ids, quantity: l.quantity, notes: l.notes || null })),
      customer: customer.name || customer.phone ? { name: customer.name || null, phone: customer.phone || null } : null,
      notes: notes || null,
      payments: [{ mode, amount: mode === 'cash' && received !== '' ? cashIn : rupees }],
      total: rupees,
      summary: lines.map((l) => `${l.quantity}× ${l.name}`).join(', ').slice(0, 80),
    });
    const prefs = printerPrefs();
    const at = new Date();
    const rows = lines.map((l) => `<tr><td>${esc(l.name)}<div class="sm">${l.quantity} × ${(l.unit).toFixed(2)}</div></td><td class="n">${(l.unit * l.quantity).toFixed(2)}</td></tr>`).join('');
    const receipt = `<div class="c big">${esc(business)}</div><hr><div class="c b">${esc(t('pos.offline.receiptTitle'))}</div>
<div class="c sm">${esc(sale.ref)} · ${esc(at.toLocaleString(intlLocale(i18n.language), { timeZone: 'Asia/Kolkata' }))}</div><hr>
<table>${rows}</table><hr><table>
${packaging ? `<tr><td>${esc(t('print.charges'))}</td><td class="n">${(packaging / 100).toFixed(2)}</td></tr>` : ''}
<tr><td>${esc(pack.prices_include_tax ? t('pos.offline.gstIncluded') : t('pos.offline.gst'))}</td><td class="n">${(tax / 100).toFixed(2)}</td></tr>
<tr class="big"><td>${esc(t('print.total'))}</td><td class="n">₹${rupees.toFixed(2)}</td></tr>
<tr><td>${esc(t(`pos.mode.${mode}`))}</td><td class="n">${(mode === 'cash' && received !== '' ? cashIn : rupees).toFixed(2)}</td></tr>
${change > 0 ? `<tr><td>${esc(t('pos.offline.change'))}</td><td class="n">${change.toFixed(2)}</td></tr>` : ''}</table>
<hr><div class="c sm">${esc(t('pos.offline.receiptNote'))}</div>`;
    printSlip(slipDocument(receipt, prefs.width, t('pos.offline.receiptTitle')));
    if (prefs.autoKot) {
      printSlip(slipDocument(kotSlip({ business, order: null, type: 'takeaway', table: null, at, notes, items: lines.map((l) => ({ quantity: l.quantity, name: l.name, detail: l.detail, notes: l.notes })) }, t, i18n.language ?? 'en'), prefs.width, 'KOT'));
    }
    toast.success(t('pos.offline.saved'));
    onDone();
  };

  return (
    <Dialog open onClose={onClose} title={t('pos.offline.title')}>
      <div className="space-y-4">
        <Alert tone="warn">{t('pos.offline.explain')}</Alert>
        <dl className="space-y-1 text-sm">
          {packaging > 0 && <div className="flex justify-between"><dt>{t('print.charges')}</dt><dd className="tabular-nums">{formatINR(packaging / 100)}</dd></div>}
          <div className="flex justify-between text-muted"><dt>{pack.prices_include_tax ? t('pos.offline.gstIncluded') : t('pos.offline.gst')}</dt><dd className="tabular-nums">{formatINR(tax / 100)}</dd></div>
          <div className="flex justify-between text-2xl font-extrabold"><dt>{t('print.total')}</dt><dd className="tabular-nums">{formatINR(rupees)}</dd></div>
        </dl>
        <div className="flex gap-1 rounded-full bg-ink/5 p-1" role="radiogroup" aria-label={t('pos.offline.paidBy')}>
          {MODES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${mode === m ? 'bg-surface shadow' : 'text-muted'}`}>{t(`pos.mode.${m}`)}</button>
          ))}
        </div>
        {mode === 'cash' && (
          <label className="block">
            <span className="field-label">{t('pos.offline.received')}</span>
            <input type="number" inputMode="decimal" min={0} className="field-input" value={received} placeholder={rupees.toFixed(0)} onChange={(e) => setReceived(e.target.value)} />
            {change > 0 && <span className="mt-1 block text-sm font-bold text-success">{t('pos.offline.giveBack', { amount: formatINR(change) })}</span>}
            {short && <span className="mt-1 block text-sm font-bold text-danger">{t('pos.offline.short')}</span>}
          </label>
        )}
        {mode !== 'cash' && <p className="text-sm text-muted">{t('pos.offline.checkPayment')}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn-primary" disabled={short} onClick={save}>{t('pos.offline.savePrint')}</button>
        </div>
      </div>
    </Dialog>
  );
}
