import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ImageUp, Keyboard, X } from 'lucide-react';
import { api } from '@/lib/api';
import { parseQrTarget } from '@/lib/dinedeskApp';
import { Spinner } from '@/components/ui';
import { openPlace, type Place } from './places';

/** The browser's built-in QR reader (Chrome / Android WebView). */
interface DetectedCode {
  rawValue: string;
}
interface Detector {
  detect(source: CanvasImageSource | ImageBitmap): Promise<DetectedCode[]>;
}
type DetectorClass = new (options?: { formats?: string[] }) => Detector;

const detectorClass = (): DetectorClass | null => (typeof window !== 'undefined' && 'BarcodeDetector' in window ? (window as unknown as { BarcodeDetector: DetectorClass }).BarcodeDetector : null);

/** live camera → a photo of the code → typing the address, whichever this phone can do. */
type Mode = 'camera' | 'photo' | 'type';

/**
 * Scan QR: the camera with BarcodeDetector where there is one, else a photo of the code, else the
 * address typed in. Only pages of DineDesk places open (table and room QR codes included).
 */
export function QrScanner({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const Klass = detectorClass();
  const canCamera = !!Klass && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const [mode, setMode] = useState<Mode>(canCamera ? 'camera' : Klass ? 'photo' : 'type');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const done = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);

  /** Opens the place a code points to, or says it isn't one. */
  const handle = useCallback(
    async (text: string) => {
      if (done.current) return;
      const target = parseQrTarget(text);
      if (!target) {
        setError(t('app.notDineDesk'));
        return;
      }
      done.current = true;
      setBusy(true);
      setError(null);
      try {
        // Name and logo for "Recently visited"; a business's own domain must be confirmed first.
        const place = (await api.get<Place>('/directory/place', { host: target.host })).data;
        openPlace(place, target.url);
      } catch {
        if (target.verified) {
          openPlace({ host: target.host, url: target.url, name: target.host.split('.')[0], business_type: '', city: null }, target.url);
          return;
        }
        done.current = false;
        setBusy(false);
        setError(t('app.notDineDesk'));
      }
    },
    [t],
  );

  // Live camera: look for a code a few times a second.
  useEffect(() => {
    if (mode !== 'camera' || !Klass) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let alive = true;
    const detector = new Klass({ formats: ['qr_code'] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (s) => {
        if (!alive) return s.getTracks().forEach((tr) => tr.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => null);
        }
        const tick = async () => {
          if (!alive || !video.current) return;
          try {
            const codes = video.current.readyState >= 2 ? await detector.detect(video.current) : [];
            if (codes[0]?.rawValue) await handle(codes[0].rawValue);
          } catch {
            /* a frame that couldn't be read */
          }
          if (alive && !done.current) timer = window.setTimeout(() => void tick(), 250);
        };
        void tick();
      })
      .catch(() => {
        // Camera blocked or missing: a photo of the code still works.
        if (alive) {
          setError(t('app.cameraBlocked'));
          setMode('photo');
        }
      });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [mode, Klass, handle, t]);

  // Escape closes; focus starts inside the sheet.
  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const fromPhoto = async (file: File | undefined) => {
    if (!file || !Klass) return;
    setError(null);
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const codes = await new Klass({ formats: ['qr_code'] }).detect(bitmap);
      setBusy(false);
      if (!codes[0]?.rawValue) setError(t('app.noQrFound'));
      else await handle(codes[0].rawValue);
    } catch {
      setBusy(false);
      setError(t('app.noQrFound'));
    }
  };

  const typed = (e: FormEvent) => {
    e.preventDefault();
    void handle(address);
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#14110f] text-[#fbf8f3]" role="dialog" aria-modal="true" aria-labelledby="scan-h" ref={dialog} tabIndex={-1}>
      <div className="mx-auto flex w-full max-w-xl items-center gap-2 px-2 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onClose} className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-white/10" aria-label={t('common.close')}>
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
        <h2 id="scan-h" className="flex-1 text-center text-lg font-bold">
          {t('app.scanTitle')}
        </h2>
        <span className="w-12" aria-hidden="true" />
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {mode === 'camera' && (
          <div className="relative mx-auto mt-4 aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-black">
            <video ref={video} className="h-full w-full object-cover" playsInline muted aria-label={t('app.scanHint')} />
            <span className="pointer-events-none absolute inset-[14%] rounded-2xl border-[3px] border-[#f2b544] shadow-[0_0_0_999px_rgb(0_0_0/0.35)]" aria-hidden="true" />
          </div>
        )}
        {mode === 'photo' && (
          <div className="mx-auto mt-6 flex w-full max-w-sm flex-col items-center rounded-3xl border border-white/15 p-6 text-center">
            <ImageUp className="h-10 w-10 text-[#f2b544]" aria-hidden="true" />
            <p className="mt-3 text-sm text-white/75">{t('app.scanPhotoHint')}</p>
            <label className="btn mt-4 w-full cursor-pointer bg-[#f2b544] text-[#14110f]">
              <Camera className="h-5 w-5" aria-hidden="true" /> {t('app.scanPhoto')}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void fromPhoto(e.target.files?.[0])} />
            </label>
          </div>
        )}
        {mode === 'type' && (
          <div className="mx-auto mt-6 flex w-full max-w-sm flex-col items-center rounded-3xl border border-white/15 p-6 text-center">
            <Keyboard className="h-10 w-10 text-[#f2b544]" aria-hidden="true" />
            <p className="mt-3 text-sm text-white/75">{t('app.scanUnsupported')}</p>
          </div>
        )}

        {mode === 'camera' && <p className="mx-auto mt-4 max-w-sm text-center text-sm text-white/70">{t('app.scanHint')}</p>}

        <div className="mx-auto mt-3 min-h-12 w-full max-w-sm" aria-live="polite">
          {busy && (
            <p className="flex items-center justify-center gap-2 text-sm font-semibold">
              <Spinner className="h-4 w-4" /> {t('app.checking')}
            </p>
          )}
          {error && !busy && <p className="rounded-xl bg-[#b91c1c]/25 px-4 py-3 text-center text-sm font-semibold text-[#ffd9d6]">{error}</p>}
        </div>

        <form onSubmit={typed} className={`mx-auto w-full max-w-sm pt-6 ${mode === 'type' ? '' : 'mt-auto'}`}>
          <label htmlFor="qr-address" className="mb-1.5 block text-sm font-semibold text-white/80">
            {t('app.addressLabel')}
          </label>
          <div className="flex gap-2">
            <input
              id="qr-address"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              dir="ltr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('app.addressPlaceholder')}
              className="h-12 min-w-0 flex-1 rounded-xl border-0 bg-white px-3.5 text-[15px] text-[#14110f] placeholder:text-[#5f574e]/80 focus:outline-none focus:ring-2 focus:ring-[#f2b544]"
            />
            <button type="submit" disabled={!address.trim() || busy} className="h-12 shrink-0 rounded-xl bg-[#f2b544] px-4 font-bold text-[#14110f] disabled:opacity-50">
              {t('app.open')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
