import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Plus, Trash2, Upload } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Alert, Dialog, Field, Spinner, toast } from '@/components/ui';
import type { AdminCategory, AdminGroup, AdminItem, AdminVariant, AdminAddon, FoodType, MenuData } from './api';
import { downloadTemplate, useMenuMutation } from './api';

const TAX_RATES = ['', '0', '5', '12', '18', '28'];
const FOOD: FoodType[] = ['veg', 'non_veg', 'egg'];
const errorsOf = (e: unknown) => (e instanceof ApiError && e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])) : {});

/* ───────── Section ───────── */

export function SectionEditor({ category, open, onClose }: { category: AdminCategory | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(category?.name ?? '');
  const [nameHi, setNameHi] = useState(category?.name_hi ?? '');
  const [tax, setTax] = useState(category?.tax_rate ? String(Number(category.tax_rate)) : '');
  const [active, setActive] = useState(category?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMenuMutation(async () => {
    const body = { name, name_hi: nameHi || null, tax_rate: tax || null, is_active: active };
    return category ? api.put(`/tenant/menu/categories/${category.id}`, body) : api.post('/tenant/menu/categories', body);
  });
  return (
    <Dialog open={open} onClose={onClose} title={category ? t('menuAdmin.editSection') : t('menuAdmin.addSection')}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(undefined, { onSuccess: () => { toast.success(t('menuAdmin.saved')); onClose(); }, onError: (err) => setErrors(errorsOf(err)) });
        }}
      >
        <Field label={t('menuAdmin.sectionName')} error={errors.name}>
          {(a) => <input {...a} className="field-input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} data-autofocus />}
        </Field>
        <Field label={t('menuAdmin.nameHi')} optional>
          {(a) => <input {...a} lang="hi" className="field-input" value={nameHi} maxLength={100} onChange={(e) => setNameHi(e.target.value)} />}
        </Field>
        <Field label={t('menuAdmin.gst')} hint={t('menuAdmin.gstSectionHint')}>
          {(a) => (
            <select {...a} className="field-input" value={tax} onChange={(e) => setTax(e.target.value)}>
              {TAX_RATES.map((r) => (
                <option key={r} value={r}>
                  {r === '' ? t('menuAdmin.gstDefault') : `${r}%`}
                </option>
              ))}
            </select>
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t('menuAdmin.sectionVisible')}
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending || name.trim().length < 1}>{save.isPending ? <Spinner /> : t('common.save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

/* ───────── Dish ───────── */

const emptyItem = (categoryId: number): Omit<AdminItem, 'id' | 'sort_order' | 'image' | 'is_demo'> => ({
  category_id: categoryId,
  name: '',
  name_hi: null,
  description: null,
  description_hi: null,
  price: '',
  tax_rate: null,
  food_type: 'veg',
  spice_level: 0,
  allergens: [],
  is_available: true,
  is_bestseller: false,
  is_chefs_special: false,
  variants: [],
  addon_group_ids: [],
});

export function DishEditor({ menu, allergens, item, categoryId, open, onClose }: { menu: MenuData; allergens: string[]; item: AdminItem | null; categoryId: number; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => (item ? { ...item, tax_rate: item.tax_rate ? String(Number(item.tax_rate)) : null } : emptyItem(categoryId)));
  const [savedId, setSavedId] = useState<number | null>(item?.id ?? null);
  const [image, setImage] = useState(item?.image ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const hasSizes = form.variants.length > 0;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setVariant = (i: number, patch: Partial<AdminVariant>) => set('variants', form.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  const save = useMenuMutation(async () => {
    const body = { ...form, price: hasSizes ? null : form.price, tax_rate: form.tax_rate || null, name_hi: form.name_hi || null, description: form.description || null, description_hi: form.description_hi || null };
    const res = savedId ? await api.put<AdminItem>(`/tenant/menu/items/${savedId}`, body) : await api.post<AdminItem>('/tenant/menu/items', body);
    return res.data;
  });
  const upload = useMenuMutation(async (f: File) => {
    const body = new FormData();
    body.append('image', f);
    return (await api.post<AdminItem>(`/tenant/menu/items/${savedId}/image`, body)).data;
  });
  const removeImage = useMenuMutation(async () => (await api.delete<AdminItem>(`/tenant/menu/items/${savedId}/image`)).data);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = t('menuAdmin.err.name');
    if (!hasSizes && (form.price === '' || Number(form.price) < 0)) errs.price = t('menuAdmin.err.price');
    form.variants.forEach((v, i) => {
      if (!v.name.trim()) errs[`variants.${i}.name`] = t('menuAdmin.err.required');
      if (v.price === '' || Number(v.price) < 0) errs[`variants.${i}.price`] = t('menuAdmin.err.price');
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate(undefined, {
      onSuccess: (saved) => {
        const isNew = !savedId;
        setSavedId(saved.id);
        setForm({ ...saved, tax_rate: saved.tax_rate ? String(Number(saved.tax_rate)) : null });
        toast.success(isNew ? t('menuAdmin.dishAdded') : t('menuAdmin.saved'));
        if (!isNew) onClose();
      },
      onError: (err) => {
        setErrors(errorsOf(err));
        setError(err.message);
      },
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title={item ? t('menuAdmin.editDish') : t('menuAdmin.addDish')} wide>
      <form className="space-y-5" noValidate onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        {savedId && !item && <Alert tone="success">{t('menuAdmin.addPhotoNow')}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('menuAdmin.dishName')} error={errors.name}>
            {(a) => <input {...a} className="field-input" maxLength={150} value={form.name} onChange={(e) => set('name', e.target.value)} data-autofocus />}
          </Field>
          <Field label={t('menuAdmin.nameHi')} optional>
            {(a) => <input {...a} lang="hi" className="field-input" maxLength={150} value={form.name_hi ?? ''} onChange={(e) => set('name_hi', e.target.value)} />}
          </Field>
          <Field label={t('menuAdmin.section')} error={errors.category_id}>
            {(a) => (
              <select {...a} className="field-input" value={form.category_id} onChange={(e) => set('category_id', Number(e.target.value))}>
                {menu.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </Field>
          <fieldset>
            <legend className="field-label">{t('menuAdmin.foodType')}</legend>
            <div className="flex gap-2">
              {FOOD.map((f) => (
                <label key={f} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border px-2 text-sm font-semibold ${form.food_type === f ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                  <input type="radio" name="food_type" className="sr-only" checked={form.food_type === f} onChange={() => set('food_type', f)} />
                  {t(`site.foodType.${f}`)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('menuAdmin.description')} optional>
            {(a) => <textarea {...a} rows={2} maxLength={1000} className="field-input" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />}
          </Field>
          <Field label={t('menuAdmin.descriptionHi')} optional>
            {(a) => <textarea {...a} lang="hi" rows={2} maxLength={1000} className="field-input" value={form.description_hi ?? ''} onChange={(e) => set('description_hi', e.target.value)} />}
          </Field>
        </div>

        <section className="rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">{t('menuAdmin.price')}</h3>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-4 w-4" checked={hasSizes} onChange={(e) => set('variants', e.target.checked ? [{ name: t('menuAdmin.half'), name_hi: null, price: form.price || '', is_available: true }, { name: t('menuAdmin.full'), name_hi: null, price: '', is_available: true }] : [])} />
              {t('menuAdmin.hasSizes')}
            </label>
          </div>
          {!hasSizes ? (
            <Field label={t('menuAdmin.priceRupees')} error={errors.price} className="mt-3 max-w-[200px]">
              {(a) => <input {...a} type="number" inputMode="decimal" min={0} step="0.01" className="field-input" value={form.price} onChange={(e) => set('price', e.target.value)} />}
            </Field>
          ) : (
            <div className="mt-3 space-y-2">
              {form.variants.map((v, i) => (
                <div key={i} className="grid grid-cols-[1fr_110px_auto_auto] items-start gap-2">
                  <Field label={t('menuAdmin.sizeName')} error={errors[`variants.${i}.name`]}>
                    {(a) => <input {...a} className="field-input" maxLength={60} value={v.name} onChange={(e) => setVariant(i, { name: e.target.value })} />}
                  </Field>
                  <Field label="₹" error={errors[`variants.${i}.price`]}>
                    {(a) => <input {...a} type="number" min={0} step="0.01" className="field-input" value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} />}
                  </Field>
                  <label className="mt-7 flex min-h-11 items-center gap-1 text-xs font-semibold">
                    <input type="checkbox" checked={v.is_available} onChange={(e) => setVariant(i, { is_available: e.target.checked })} />
                    {t('menuAdmin.available')}
                  </label>
                  <button type="button" className="btn-ghost mt-6 !min-h-11 !px-2.5 text-danger" disabled={form.variants.length <= 1} onClick={() => set('variants', form.variants.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">{t('menuAdmin.removeSize', { name: v.name })}</span>
                  </button>
                </div>
              ))}
              {form.variants.length < 10 && (
                <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => set('variants', [...form.variants, { name: '', name_hi: null, price: '', is_available: true }])}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> {t('menuAdmin.addSize')}
                </button>
              )}
            </div>
          )}
          <Field label={t('menuAdmin.gst')} hint={t('menuAdmin.gstDishHint')} className="mt-4 max-w-[240px]">
            {(a) => (
              <select {...a} className="field-input" value={form.tax_rate ?? ''} onChange={(e) => set('tax_rate', e.target.value || null)}>
                {TAX_RATES.map((r) => (
                  <option key={r} value={r}>{r === '' ? t('menuAdmin.gstInherit') : `${r}%`}</option>
                ))}
              </select>
            )}
          </Field>
        </section>

        {menu.addon_groups.length > 0 && (
          <fieldset>
            <legend className="field-label">{t('menuAdmin.extras')}</legend>
            <div className="flex flex-wrap gap-2">
              {menu.addon_groups.map((g) => {
                const on = form.addon_group_ids.includes(g.id);
                return (
                  <label key={g.id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${on ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => set('addon_group_ids', on ? form.addon_group_ids.filter((id) => id !== g.id) : [...form.addon_group_ids, g.id])} />
                    {g.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="field-label">{t('menuAdmin.spice')}</legend>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((n) => (
                <label key={n} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border text-sm ${form.spice_level === n ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                  <input type="radio" name="spice" className="sr-only" checked={form.spice_level === n} onChange={() => set('spice_level', n)} />
                  {n === 0 ? t('menuAdmin.notSpicy') : '🌶'.repeat(n)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="field-label">{t('menuAdmin.allergens')}</legend>
            <div className="flex flex-wrap gap-1.5">
              {allergens.map((al) => {
                const on = form.allergens.includes(al);
                return (
                  <label key={al} className={`flex min-h-9 cursor-pointer items-center rounded-full border px-2.5 text-xs font-semibold ${on ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => set('allergens', on ? form.allergens.filter((x) => x !== al) : [...form.allergens, al])} />
                    {t(`menuAdmin.allergen.${al}`)}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(['is_available', 'is_bestseller', 'is_chefs_special'] as const).map((k) => (
            <label key={k} className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-4 w-4" checked={form[k]} onChange={(e) => set(k, e.target.checked)} />
              {t(`menuAdmin.flag.${k}`)}
            </label>
          ))}
        </div>

        <section className="flex items-center gap-4 rounded-xl border border-line p-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-paper">
            {upload.isPending || removeImage.isPending ? <Spinner /> : image ? <img src={image.src} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-muted" aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold">{t('menuAdmin.photo')}</p>
            <p className="text-sm text-muted">{savedId ? t('menuAdmin.photoHint') : t('menuAdmin.photoAfterSave')}</p>
            {image?.credit && <p className="text-xs text-muted">{t('menuAdmin.photoCredit', { author: image.credit.author, license: image.credit.license })}</p>}
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) upload.mutate(f, { onSuccess: (it) => { setImage(it.image); toast.success(t('menuAdmin.photoSaved')); }, onError: (err) => toast.error(err.message) });
            }} />
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn-outline !min-h-10 text-sm" disabled={!savedId} onClick={() => file.current?.click()}>
                <Upload className="h-4 w-4" aria-hidden="true" /> {image ? t('website.upload.replace') : t('website.upload.choose')}
              </button>
              {image && (
                <button type="button" className="btn-ghost !min-h-10 text-sm text-danger" onClick={() => removeImage.mutate(undefined, { onSuccess: () => setImage(null) })}>
                  {t('common.remove')}
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>{savedId && !item ? t('menuAdmin.done') : t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

/* ───────── Add-on group ───────── */

export function GroupEditor({ group, open, onClose }: { group: AdminGroup | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(group?.name ?? '');
  const [nameHi, setNameHi] = useState(group?.name_hi ?? '');
  const [min, setMin] = useState(group?.min_select ?? 0);
  const [max, setMax] = useState<number | ''>(group?.max_select ?? '');
  const [addons, setAddons] = useState<AdminAddon[]>(group?.addons ?? [{ name: '', name_hi: null, price: '', food_type: 'veg', is_available: true }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMenuMutation(async () => {
    const body = { name, name_hi: nameHi || null, min_select: min, max_select: max === '' ? null : max, addons };
    return group ? api.put(`/tenant/menu/addon-groups/${group.id}`, body) : api.post('/tenant/menu/addon-groups', body);
  });
  const setAddon = (i: number, patch: Partial<AdminAddon>) => setAddons(addons.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <Dialog open={open} onClose={onClose} title={group ? t('menuAdmin.editGroup') : t('menuAdmin.addGroup')} wide>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(undefined, { onSuccess: () => { toast.success(t('menuAdmin.saved')); onClose(); }, onError: (err) => { setErrors(errorsOf(err)); toast.error(err.message); } });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('menuAdmin.groupName')} hint={t('menuAdmin.groupNameHint')} error={errors.name}>
            {(a) => <input {...a} className="field-input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} data-autofocus />}
          </Field>
          <Field label={t('menuAdmin.nameHi')} optional>
            {(a) => <input {...a} lang="hi" className="field-input" maxLength={80} value={nameHi} onChange={(e) => setNameHi(e.target.value)} />}
          </Field>
          <Field label={t('menuAdmin.minSelect')} hint={t('menuAdmin.minHint')}>
            {(a) => <input {...a} type="number" min={0} max={10} className="field-input" value={min} onChange={(e) => setMin(Number(e.target.value))} />}
          </Field>
          <Field label={t('menuAdmin.maxSelect')} hint={t('menuAdmin.maxHint')} error={errors.max_select}>
            {(a) => <input {...a} type="number" min={1} max={20} className="field-input" value={max} onChange={(e) => setMax(e.target.value === '' ? '' : Number(e.target.value))} />}
          </Field>
        </div>
        <div className="space-y-2">
          {addons.map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_100px_110px_auto] items-end gap-2">
              <Field label={t('menuAdmin.extraName')} error={errors[`addons.${i}.name`]}>
                {(p) => <input {...p} className="field-input" maxLength={80} value={a.name} onChange={(e) => setAddon(i, { name: e.target.value })} />}
              </Field>
              <Field label="₹" error={errors[`addons.${i}.price`]}>
                {(p) => <input {...p} type="number" min={0} step="0.01" className="field-input" value={a.price} onChange={(e) => setAddon(i, { price: e.target.value })} />}
              </Field>
              <Field label={t('menuAdmin.foodType')}>
                {(p) => (
                  <select {...p} className="field-input" value={a.food_type} onChange={(e) => setAddon(i, { food_type: e.target.value as FoodType })}>
                    {FOOD.map((f) => <option key={f} value={f}>{t(`site.foodType.${f}`)}</option>)}
                  </select>
                )}
              </Field>
              <button type="button" className="btn-ghost !min-h-11 !px-2.5 text-danger" disabled={addons.length <= 1} onClick={() => setAddons(addons.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t('menuAdmin.removeExtra', { name: a.name })}</span>
              </button>
            </div>
          ))}
          <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => setAddons([...addons, { name: '', name_hi: null, price: '', food_type: 'veg', is_available: true }])}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t('menuAdmin.addExtra')}
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? <Spinner /> : t('common.save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

/* ───────── CSV import ───────── */

interface ImportReport {
  valid: boolean;
  rows: number;
  new_categories: string[];
  errors: { row: number; messages: string[] }[];
  preview: { row: number; category: string; name: string; price: string; variants: string }[];
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const check = useMenuMutation(async (f: File) => {
    const body = new FormData();
    body.append('file', f);
    body.append('dry_run', '1');
    return (await api.post<ImportReport>('/tenant/menu/import', body)).data;
  });
  const run = useMenuMutation(async (f: File) => {
    const body = new FormData();
    body.append('file', f);
    body.append('dry_run', '0');
    return api.post('/tenant/menu/import', body);
  });
  return (
    <Dialog open={open} onClose={onClose} title={t('menuAdmin.importTitle')} wide>
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>
            {t('menuAdmin.importStep1')}{' '}
            <button type="button" className="font-semibold text-brand-strong underline" onClick={() => void downloadTemplate().catch((e) => toast.error((e as Error).message))}>
              {t('menuAdmin.downloadTemplate')}
            </button>
          </li>
          <li>{t('menuAdmin.importStep2')}</li>
          <li>{t('menuAdmin.importStep3')}</li>
        </ol>
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line p-4 text-center hover:border-ink/40">
          <Upload className="h-6 w-6 text-muted" aria-hidden="true" />
          <span className="mt-1 font-semibold">{file ? file.name : t('menuAdmin.chooseCsv')}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setReport(null);
            if (f) check.mutate(f, { onSuccess: setReport, onError: (err) => toast.error(err.message) });
          }} />
        </label>
        {check.isPending && <p className="flex items-center gap-2 text-sm"><Spinner className="h-4 w-4" /> {t('menuAdmin.checking')}</p>}
        {report && (
          <div className="space-y-3">
            {report.valid ? (
              <Alert tone="success">{t('menuAdmin.importReady', { rows: report.rows, sections: report.new_categories.length })}</Alert>
            ) : (
              <Alert tone="danger">{t('menuAdmin.importErrors', { count: report.errors.length })}</Alert>
            )}
            {report.errors.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-danger-soft p-3 text-sm text-danger">
                {report.errors.map((e) => (
                  <li key={e.row}>
                    <strong>{e.row ? t('menuAdmin.row', { row: e.row }) : t('menuAdmin.file')}:</strong> {e.messages.join(' ')}
                  </li>
                ))}
              </ul>
            )}
            {report.valid && report.preview.length > 0 && (
              <div className="max-h-56 overflow-auto rounded-xl border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="bg-paper text-xs uppercase text-muted"><tr><th className="px-3 py-2">{t('menuAdmin.section')}</th><th className="px-3 py-2">{t('menuAdmin.dishName')}</th><th className="px-3 py-2">{t('menuAdmin.price')}</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {report.preview.map((p) => (
                      <tr key={p.row}><td className="px-3 py-1.5">{p.category}</td><td className="px-3 py-1.5">{p.name}</td><td className="px-3 py-1.5">{p.variants || `₹${p.price}`}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!file || !report?.valid || run.isPending}
            onClick={() => file && run.mutate(file, { onSuccess: () => { toast.success(t('menuAdmin.imported', { count: report?.rows })); onClose(); }, onError: (err) => toast.error(err.message) })}
          >
            {run.isPending ? <Spinner /> : t('menuAdmin.importNow', { count: report?.rows ?? 0 })}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
