import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Camera, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Alert, Dialog, Spinner, toast } from '@/components/ui';
import { useMenuMutation } from './api';

type FoodType = '' | 'veg' | 'non_veg' | 'egg';
interface Row { category: string; name: string; description: string; price: string; food_type: FoodType; variants: string }
interface ReadResult { rows: Row[]; notes: string[] }
interface ImportError { row: number; messages: string[] }

const MAX_FILES = 6;
const COLUMNS: (keyof Row)[] = ['category', 'name', 'description', 'price', 'food_type', 'variants'];
const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Whether AI features are switched on for this server (an Anthropic key is set). */
export function useAiStatus() {
  return useQuery({ queryKey: ['menu-ai'], queryFn: async () => (await api.get<{ enabled: boolean }>('/tenant/menu/ai')).data, staleTime: 5 * 60_000 });
}

/**
 * Photos (or a PDF) of a printed menu → dishes to check and correct → saved through the CSV import,
 * so the same checks (prices, plan limit, all-or-nothing) apply.
 * `onSaved` runs after the dishes are added, instead of `onClose` (onboarding uses it to move on).
 */
export function AiImportDialog({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const { t } = useTranslation();
  const status = useAiStatus();
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<(Row & { keep: boolean })[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);

  const read = useMenuMutation(async (picked: File[]) => {
    const body = new FormData();
    picked.forEach((f) => body.append('files[]', f));
    return (await api.post<ReadResult>('/tenant/menu/ai/read', body)).data;
  });
  // Checked first (dry run) so problems show next to the dishes; then imported in one go.
  const save = useMenuMutation(async (list: Row[]) => {
    const csv = [COLUMNS.join(','), ...list.map((r) => COLUMNS.map((c) => csvCell(r[c] ?? '')).join(','))].join('\n');
    const send = async (dry: boolean) => {
      const body = new FormData();
      body.append('file', new File([`\u{FEFF}${csv}`], 'ai-menu.csv', { type: 'text/csv' }));
      body.append('dry_run', dry ? '1' : '0');
      return (await api.post<{ valid?: boolean; errors?: ImportError[] }>('/tenant/menu/import', body)).data;
    };
    const report = await send(true);
    if (!report.valid) return { errors: report.errors ?? [] };
    await send(false);
    return { errors: [] as ImportError[] };
  });

  const add = (list: FileList | null) => {
    // Copy now: the input is cleared right after, which empties its live FileList.
    const picked = list ? Array.from(list) : [];
    if (picked.length) setFiles((cur) => [...cur, ...picked].slice(0, MAX_FILES));
  };
  const start = () => read.mutate(files, {
    onSuccess: (r) => {
      setRows(r.rows.map((row) => ({ ...row, keep: true })));
      setNotes(r.notes);
    },
    onError: (e) => toast.error(e.message),
  });
  const kept = rows?.filter((r) => r.keep) ?? [];
  const missingPrice = kept.filter((r) => !r.price && !r.variants).length;
  const setRow = (i: number, patch: Partial<Row & { keep: boolean }>) => setRows((cur) => cur!.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const finish = () => save.mutate(kept, {
    onSuccess: (r) => {
      setImportErrors(r.errors);
      if (r.errors.length) return;
      toast.success(t('menuAdmin.ai.added', { count: kept.length }));
      (onSaved ?? onClose)();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onClose={onClose} title={t('menuAdmin.ai.title')} wide>
      {status.data && !status.data.enabled ? (
        <div className="space-y-4">
          <Alert tone="info">{t('menuAdmin.ai.off')}</Alert>
          <div className="flex justify-end"><button type="button" className="btn-outline" onClick={onClose}>{t('common.close')}</button></div>
        </div>
      ) : !rows ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('menuAdmin.ai.intro')}</p>
          <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line p-4 text-center hover:border-ink/40">
            <Camera className="h-7 w-7 text-muted" aria-hidden="true" />
            <span className="font-semibold">{t('menuAdmin.ai.pick')}</span>
            <span className="text-xs text-muted">{t('menuAdmin.ai.pickHint', { count: MAX_FILES })}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          </label>
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-full bg-ink/5 py-1 pl-3 pr-1 text-sm">
                  <span className="max-w-48 truncate">{f.name}</span>
                  <button type="button" className="rounded-full p-1 hover:bg-ink/10" onClick={() => setFiles(files.filter((_, n) => n !== i))} aria-label={t('common.remove')}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          )}
          {read.isPending && <p className="flex items-center gap-2 text-sm font-semibold"><Spinner className="h-4 w-4" /> {t('menuAdmin.ai.reading')}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={onClose}>{t('common.cancel')}</button>
            <button type="button" className="btn-primary" disabled={!files.length || read.isPending} onClick={start}>
              {read.isPending ? <Spinner /> : <><Sparkles className="h-4 w-4" aria-hidden="true" /> {t('menuAdmin.ai.read')}</>}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Alert tone="warn">{t('menuAdmin.ai.check')}</Alert>
          {notes.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          {importErrors.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-danger-soft p-3 text-sm text-danger">
              {/* CSV row numbers start at 2 (row 1 is the header). */}
              {importErrors.map((e) => <li key={e.row}><strong>{e.row ? kept[e.row - 2]?.name ?? t('menuAdmin.row', { row: e.row }) : t('menuAdmin.file')}:</strong> {e.messages.join(' ')}</li>)}
            </ul>
          )}
          <div className="max-h-[52vh] overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="sticky top-0 bg-paper text-xs uppercase text-muted">
                <tr>
                  <th className="w-8 px-2 py-2"><span className="sr-only">{t('menuAdmin.ai.keep')}</span></th>
                  <th className="px-2 py-2">{t('menuAdmin.section')}</th>
                  <th className="w-64 px-2 py-2">{t('menuAdmin.dishName')}</th>
                  <th className="w-24 px-2 py-2">{t('menuAdmin.price')}</th>
                  <th className="px-2 py-2">{t('menuAdmin.ai.sizes')}</th>
                  <th className="w-28 px-2 py-2">{t('menuAdmin.ai.type')}</th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => {
                  const noPrice = r.keep && !r.price && !r.variants;
                  return (
                    <tr key={i} className={r.keep ? '' : 'opacity-40'}>
                      <td className="px-2 py-1"><input type="checkbox" checked={r.keep} onChange={(e) => setRow(i, { keep: e.target.checked })} aria-label={t('menuAdmin.ai.keepDish', { name: r.name })} /></td>
                      <td className="px-2 py-1"><input className="field-input !min-h-9 !py-1" value={r.category} onChange={(e) => setRow(i, { category: e.target.value })} aria-label={t('menuAdmin.section')} /></td>
                      <td className="px-2 py-1"><input className="field-input !min-h-9 !py-1" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} aria-label={t('menuAdmin.dishName')} /></td>
                      <td className="px-2 py-1"><input inputMode="decimal" className={`field-input !min-h-9 !py-1 ${noPrice ? '!border-danger' : ''}`} value={r.price} placeholder={r.variants ? '—' : '₹'} onChange={(e) => setRow(i, { price: e.target.value })} aria-label={t('menuAdmin.price')} /></td>
                      <td className="px-2 py-1"><input className="field-input !min-h-9 !py-1" value={r.variants} placeholder="Half:180|Full:320" onChange={(e) => setRow(i, { variants: e.target.value })} aria-label={t('menuAdmin.ai.sizes')} /></td>
                      <td className="px-2 py-1">
                        <select className="field-input !min-h-9 !py-1" value={r.food_type} onChange={(e) => setRow(i, { food_type: e.target.value as FoodType })} aria-label={t('menuAdmin.ai.type')}>
                          <option value="">{t('menuAdmin.ai.typeUnknown')}</option>
                          <option value="veg">{t('menuAdmin.ai.veg')}</option>
                          <option value="non_veg">{t('menuAdmin.ai.nonVeg')}</option>
                          <option value="egg">{t('menuAdmin.ai.egg')}</option>
                        </select>
                      </td>
                      <td className="px-2 py-1"><button type="button" className="rounded p-1 text-muted hover:text-danger" onClick={() => setRows(rows.filter((_, n) => n !== i))} aria-label={t('common.remove')}><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-sm ${missingPrice ? 'font-semibold text-danger' : 'text-muted'}`}>{missingPrice ? t('menuAdmin.ai.missingPrice', { count: missingPrice }) : t('menuAdmin.ai.typeHint')}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-outline" onClick={() => { setRows(null); setImportErrors([]); }}>{t('menuAdmin.ai.back')}</button>
              <button type="button" className="btn-primary" disabled={!kept.length || missingPrice > 0 || save.isPending} onClick={finish}>
                {save.isPending ? <Spinner /> : t('menuAdmin.ai.add', { count: kept.length })}
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** "Write with AI" next to a dish's description: fills English and Hindi for the owner to edit. */
export function DescribeButton({ name, foodType, onText }: { name: string; foodType: string | null; onText: (t: { description: string; description_hi: string }) => void }) {
  const { t } = useTranslation();
  const status = useAiStatus();
  const write = useMenuMutation(async () => (await api.post<{ description: string; description_hi: string }>('/tenant/menu/ai/describe', { name, food_type: foodType || null })).data);
  if (!status.data?.enabled) return null;
  return (
    <button type="button" className="btn-ghost !min-h-9 text-sm" disabled={!name.trim() || write.isPending} onClick={() => write.mutate(undefined, { onSuccess: onText, onError: (e) => toast.error(e.message) })}>
      {write.isPending ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />} {t('menuAdmin.ai.describe')}
    </button>
  );
}
