import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Spinner, toast } from '@/components/ui';
import type { SiteImage } from '@/site/types';
import { useSiteImage } from './api';

const MAX_MB = 8;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Logo / cover uploader. Files are converted to WebP on the server. */
export function ImageUpload({ slot, image, round = false }: { slot: 'logo' | 'cover'; image: SiteImage | null; round?: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const { upload, remove } = useSiteImage(slot);
  const busy = upload.isPending || remove.isPending;

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast.error(t('website.upload.type'));
    if (file.size > MAX_MB * 1024 * 1024) return toast.error(t('website.upload.size', { mb: MAX_MB }));
    upload.mutate(file, {
      onSuccess: () => toast.success(t(`website.upload.done.${slot}`)),
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="flex items-center gap-4">
      <div className={`flex shrink-0 items-center justify-center overflow-hidden border border-line bg-paper ${round ? 'h-20 w-20 rounded-full' : 'aspect-[16/9] w-40 rounded-xl'}`}>
        {busy ? <Spinner /> : image ? <img src={image.src} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-muted" aria-hidden="true" />}
      </div>
      <div className="min-w-0">
        <p id={`${id}-label`} className="font-semibold">
          {t(`website.upload.${slot}`)}
        </p>
        <p className="text-sm text-muted">{t(`website.upload.${slot}Hint`, { mb: MAX_MB })}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input ref={input} id={id} type="file" accept={TYPES.join(',')} className="sr-only" aria-labelledby={`${id}-label`} onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }} />
          <button type="button" className="btn-outline !min-h-10 text-sm" disabled={busy} onClick={() => input.current?.click()}>
            {image ? t('website.upload.replace') : t('website.upload.choose')}
          </button>
          {image && (
            <button type="button" className="btn-ghost !min-h-10 text-sm text-danger" disabled={busy} onClick={() => remove.mutate(undefined, { onSuccess: () => toast.success(t('website.upload.removed')) })}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> {t('common.remove')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
