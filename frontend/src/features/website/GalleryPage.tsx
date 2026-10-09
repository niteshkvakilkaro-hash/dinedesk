import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Alert, Dialog, EmptyState, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';
import type { GalleryItem } from '@/site/types';
import { useGallery } from './api';

const CATEGORIES = ['food', 'interior', 'events'] as const;
type Category = (typeof CATEGORIES)[number];

function PhotoForm({ initial, file, busy, error, onSubmit, onCancel }: { initial?: GalleryItem; file?: File | null; busy: boolean; error?: string; onSubmit: (v: { alt_text: string; caption: string | null; category: Category }) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [alt, setAlt] = useState(initial?.alt_text ?? '');
  const [caption, setCaption] = useState(initial?.caption ?? '');
  const [category, setCategory] = useState<Category>(initial?.category ?? 'food');
  const [altError, setAltError] = useState('');
  const [preview, setPreview] = useState<string | undefined>(initial?.image?.src);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (alt.trim().length < 3) return setAltError(t('gallery.altRequired'));
        onSubmit({ alt_text: alt.trim(), caption: caption.trim() || null, category });
      }}
      className="space-y-4"
    >
      {error && <Alert>{error}</Alert>}
      {preview && <img src={preview} alt="" className="max-h-56 w-full rounded-xl object-cover" />}
      <Field label={t('gallery.alt')} hint={t('gallery.altHint')} error={altError}>
        {(a) => <input {...a} maxLength={200} className="field-input" value={alt} onChange={(e) => setAlt(e.target.value)} autoFocus />}
      </Field>
      <Field label={t('gallery.caption')} optional>
        {(a) => <input {...a} maxLength={200} className="field-input" value={caption} onChange={(e) => setCaption(e.target.value)} />}
      </Field>
      <fieldset>
        <legend className="field-label">{t('gallery.category')}</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <label key={c} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold ${category === c ? 'border-ink bg-ink text-paper' : 'border-line'}`}>
              <input type="radio" name="category" value={c} checked={category === c} onChange={() => setCategory(c)} className="sr-only" />
              {t(`site.galleryCat.${c}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-outline" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <Spinner /> : t('common.save')}
        </button>
      </div>
    </form>
  );
}

export default function GalleryPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const query = useGallery();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [formError, setFormError] = useState('');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['gallery'] });
    void qc.invalidateQueries({ queryKey: ['site'] });
  };

  const add = useMutation<unknown, ApiError, { alt_text: string; caption: string | null; category: Category }>({
    mutationFn: (v) => {
      const body = new FormData();
      body.append('image', file!);
      body.append('alt_text', v.alt_text);
      if (v.caption) body.append('caption', v.caption);
      body.append('category', v.category);
      return api.post('/tenant/gallery', body);
    },
    onSuccess: () => {
      toast.success(t('gallery.added'));
      setFile(null);
      refresh();
    },
    onError: (e) => setFormError(e.message),
  });
  const update = useMutation<unknown, ApiError, { id: number; alt_text: string; caption: string | null; category: Category }>({
    mutationFn: ({ id, ...v }) => api.put(`/tenant/gallery/${id}`, v),
    onSuccess: () => {
      toast.success(t('gallery.updated'));
      setEditing(null);
      refresh();
    },
    onError: (e) => setFormError(e.message),
  });
  const remove = useMutation<unknown, ApiError, number>({
    mutationFn: (id) => api.delete(`/tenant/gallery/${id}`),
    onSuccess: () => {
      toast.success(t('gallery.removed'));
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const reorder = useMutation<unknown, ApiError, number[]>({
    mutationFn: (ids) => api.put('/tenant/gallery/order', { ids }),
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });

  if (query.isError) return <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />;
  if (!query.data) return <SkeletonRows rows={4} />;
  const { items, max } = query.data;

  const move = (i: number, d: -1 | 1) => {
    const ids = items.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    qc.setQueryData(['gallery'], { items: ids.map((id) => items.find((x) => x.id === id)!), max });
    reorder.mutate(ids);
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return toast.error(t('website.upload.type'));
    if (f.size > 8 * 1024 * 1024) return toast.error(t('website.upload.size', { mb: 8 }));
    setFormError('');
    setFile(f);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t('gallery.title')}</h1>
          <p className="text-muted">{t('gallery.subtitle', { count: items.length, max })}</p>
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }} />
        <button type="button" className="btn-primary" disabled={items.length >= max} onClick={() => input.current?.click()}>
          <ImagePlus className="h-5 w-5" aria-hidden="true" /> {t('gallery.add')}
        </button>
      </div>
      <Alert tone="info">{t('gallery.realOnly')}</Alert>

      {items.length === 0 ? (
        <EmptyState title={t('gallery.empty')}>{t('gallery.emptyHint')}</EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((g, i) => (
            <li key={g.id} className="card overflow-hidden">
              {g.image && <img src={g.image.src} alt="" className="aspect-square w-full object-cover" loading="lazy" style={g.image.placeholder ? { backgroundImage: `url(${g.image.placeholder})`, backgroundSize: 'cover' } : undefined} />}
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-semibold">{g.alt_text}</p>
                <p className="text-xs text-muted">
                  {t(`site.galleryCat.${g.category}`)}
                  {g.is_demo && ` · ${t('common.demo')}`}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  <button type="button" className="btn-ghost !min-h-10 !px-2.5" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">{t('gallery.moveEarlier', { alt: g.alt_text })}</span>
                  </button>
                  <button type="button" className="btn-ghost !min-h-10 !px-2.5" disabled={i === items.length - 1 || reorder.isPending} onClick={() => move(i, 1)}>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">{t('gallery.moveLater', { alt: g.alt_text })}</span>
                  </button>
                  <button type="button" className="btn-ghost ml-auto !min-h-10 !px-2.5" onClick={() => { setFormError(''); setEditing(g); }}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">{t('gallery.edit', { alt: g.alt_text })}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !min-h-10 !px-2.5 text-danger"
                    onClick={() => window.confirm(t('gallery.removeConfirm')) && remove.mutate(g.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">{t('gallery.remove', { alt: g.alt_text })}</span>
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!file} onClose={() => setFile(null)} title={t('gallery.addTitle')}>
        {file && <PhotoForm file={file} busy={add.isPending} error={formError} onCancel={() => setFile(null)} onSubmit={(v) => add.mutate(v)} />}
      </Dialog>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={t('gallery.editTitle')}>
        {editing && <PhotoForm initial={editing} busy={update.isPending} error={formError} onCancel={() => setEditing(null)} onSubmit={(v) => update.mutate({ id: editing.id, ...v })} />}
      </Dialog>
    </div>
  );
}
