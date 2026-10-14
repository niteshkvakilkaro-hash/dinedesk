import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import QRCode from 'qrcode';
import { BookOpen, Check, Download, ExternalLink, PartyPopper, SkipForward, Sparkles, type LucideIcon } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { PLATFORM_DOMAIN, tenantSiteUrl } from '@/lib/host';
import { useAuthStore } from '@/stores/auth';
import { useDebounced } from '@/hooks/useDebounced';
import { Alert, Field, Spinner } from '@/components/ui';
import { isThemeKey } from '@/themes/registry';
import type { ThemeKey } from '@/themes/types';
import type { Session } from '@/types';
import { ColorFields, LivePreview, ThemeCards, validColor } from '@/features/website/ThemePicker';
import { ImageUpload } from '@/features/website/ImageUpload';
import { useWebsite } from '@/features/website/api';
import { AiImportDialog, useAiStatus } from '@/features/menu/AiImport';

export type SetupStep = 4 | 5 | 6 | 7;
type Step = SetupStep;
type MenuMode = 'ai' | 'sample' | 'skip';

function StepActions({ onBack, busy, disabled, label, onNext }: { onBack?: () => void; busy: boolean; disabled?: boolean; label: string; onNext: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-between gap-3">
      {onBack ? (
        <button type="button" className="btn-outline" onClick={onBack}>
          {t('common.back')}
        </button>
      ) : (
        <span />
      )}
      <button type="button" className="btn-brand" disabled={busy || disabled} onClick={onNext}>
        {busy ? <Spinner /> : label}
      </button>
    </div>
  );
}

/** Confetti made of a few dozen squares; skipped entirely with reduced motion. */
function Confetti() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const colors = ['#c2410c', '#f2b544', '#15803d', '#641E16', '#7ED9B5', '#D7261E'];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 48 }, (_, i) => {
        const x = (i * 37) % 100;
        return (
          <motion.span
            key={i}
            className="absolute top-0 block h-2.5 w-2"
            style={{ left: `${x}%`, background: colors[i % colors.length] }}
            initial={{ y: -20, rotate: 0, opacity: 1 }}
            animate={{ y: '105vh', rotate: (i % 2 ? 1 : -1) * 540, x: ((i % 7) - 3) * 30, opacity: [1, 1, 0] }}
            transition={{ duration: 2.4 + (i % 5) * 0.3, delay: (i % 12) * 0.05, ease: 'easeIn' }}
          />
        );
      })}
    </div>
  );
}

function Celebration({ session, onDone }: { session: Session; onDone: () => void }) {
  const { t } = useTranslation();
  const url = tenantSiteUrl(session.tenant!.slug);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    void QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: '#14110f', light: '#ffffff' } }).then(setQr);
  }, [url]);
  return (
    <section className="mt-8 text-center" aria-labelledby="live-title">
      <Confetti />
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
        <PartyPopper className="h-8 w-8" aria-hidden="true" />
      </span>
      <h2 id="live-title" className="mt-4 text-3xl font-extrabold">
        {t('setup.live.title')}
      </h2>
      <p className="mt-2 text-muted">{t('setup.live.text', { name: session.tenant!.name })}</p>
      <p className="mt-4 break-all font-mono text-lg font-semibold">{session.tenant!.site_host}</p>
      {qr && (
        <figure className="mx-auto mt-6 w-60">
          <img src={qr} alt={t('setup.live.qrAlt', { url })} width={240} height={240} className="rounded-xl border border-line" />
          <figcaption className="mt-2 text-sm text-muted">{t('setup.live.qrHint')}</figcaption>
        </figure>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn-brand">
          {t('setup.live.open')} <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
        {qr && (
          <a href={qr} download={`${session.tenant!.slug}-qr.png`} className="btn-outline">
            <Download className="h-4 w-4" aria-hidden="true" /> {t('setup.live.downloadQr')}
          </a>
        )}
        <button type="button" className="btn-primary" onClick={onDone}>
          {t('setup.live.dashboard')}
        </button>
      </div>
    </section>
  );
}

export function SiteSetup({ session, step, setStep }: { session: Session; step: Step; setStep: (s: Step) => void }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const tenant = session.tenant!;
  const website = useWebsite();

  const [theme, setTheme] = useState<ThemeKey>('haveli');
  const [colors, setColors] = useState<{ primary_color: string | null; accent_color: string | null }>({ primary_color: null, accent_color: null });
  const [tagline, setTagline] = useState('');
  const [taglineHi, setTaglineHi] = useState('');
  const [menuMode, setMenuMode] = useState<MenuMode | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  // Set once the AI dishes are saved, so a failed step save retries without importing them twice.
  const [imported, setImported] = useState(false);
  const ai = useAiStatus();
  const aiEnabled = ai.data?.enabled === true;
  const [slug, setSlug] = useState(tenant.slug);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [liveSession, setLiveSession] = useState<Session | null>(null);

  // Seed the form from saved settings once; later refetches must not overwrite what the owner is typing.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    const w = website.data;
    if (!w || seeded) return;
    setSeeded(true);
    if (isThemeKey(w.theme.key)) setTheme(w.theme.key);
    setColors({ primary_color: w.theme.primary_color, accent_color: w.theme.accent_color });
    setTagline(w.content.tagline ?? '');
    setTaglineHi(w.content.tagline_hi ?? '');
  }, [website.data, seeded]);

  const cleanSlug = slug.trim().toLowerCase();
  const debouncedSlug = useDebounced(cleanSlug, 350);
  const check = useQuery({
    queryKey: ['subdomain', debouncedSlug],
    queryFn: async () => (await api.get<{ available: boolean; message: string | null; suggestion: string | null; host: string }>('/onboarding/subdomain', { slug: debouncedSlug })).data,
    enabled: step === 7 && debouncedSlug.length > 0,
  });

  const run = async (fn: () => Promise<Session | void>, next?: Step) => {
    setError('');
    setBusy(true);
    try {
      const s = await fn();
      if (s) qc.setQueryData(['session', token], s);
      void qc.invalidateQueries({ queryKey: ['website'] });
      if (next) setStep(next);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const saveTheme = () => run(async () => (await api.put<Session>('/onboarding/theme', { theme })).data, 5);
  const saveBranding = () => run(async () => (await api.put<Session>('/onboarding/branding', { ...colors, tagline: tagline.trim() || null, tagline_hi: taglineHi.trim() || null })).data, 6);
  const saveMenu = (mode: 'sample' | 'skip' | 'imported') => run(async () => (await api.post<Session>('/onboarding/menu', { mode })).data, 7);
  const menuNext = () => {
    if (menuMode === 'ai') {
      if (imported) void saveMenu('imported');
      else setAiOpen(true);
    } else if (menuMode) void saveMenu(menuMode);
  };
  const menuChoices: [MenuMode, LucideIcon][] = [['sample', BookOpen], ['skip', SkipForward]];
  // AI first when it's on; shown switched off (with the reason) when the server has no AI key.
  if (aiEnabled) menuChoices.unshift(['ai', Sparkles]);
  else if (ai.data) menuChoices.push(['ai', Sparkles]);
  const goLive = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await api.post<Session>('/onboarding/go-live', { slug: cleanSlug });
      setLiveSession(res.data); // session is applied after the celebration (it moves the owner to the dashboard)
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const slide = reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 } };

  if (liveSession) {
    return (
      <Celebration
        session={liveSession}
        onDone={() => {
          qc.setQueryData(['session', token], liveSession);
          navigate('/dashboard', { replace: true });
        }}
      />
    );
  }

  const preview = <LivePreview slug={tenant.slug} state={{ theme, ...colors }} />;

  return (
    <AnimatePresence mode="wait">
      <motion.section key={step} {...slide} transition={{ duration: 0.3 }} className="mt-8 space-y-5" aria-labelledby="step-title">
        <div>
          <h2 id="step-title" className="text-xl font-bold">
            {t(`setup.step${step}.title`)}
          </h2>
          <p className="text-muted">{t(`setup.step${step}.subtitle`)}</p>
        </div>
        {error && <Alert>{error}</Alert>}

        {step === 4 && (
          <>
            <ThemeCards value={theme} onChange={setTheme} />
            {preview}
            <StepActions busy={busy} label={t('common.continue')} onNext={() => void saveTheme()} />
          </>
        )}

        {step === 5 && (
          <>
            <div className="card space-y-6 p-5">
              <ImageUpload slot="logo" image={website.data?.theme.logo ?? null} round />
              <ColorFields theme={theme} primary={colors.primary_color} accent={colors.accent_color} onChange={setColors} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('setup.step5.tagline')} optional hint={t('setup.step5.taglineHint')}>
                  {(a) => <input {...a} maxLength={140} className="field-input" value={tagline} onChange={(e) => setTagline(e.target.value)} />}
                </Field>
                <Field label={t('setup.step5.taglineHi')} optional>
                  {(a) => <input {...a} lang="hi" maxLength={140} className="field-input" value={taglineHi} onChange={(e) => setTaglineHi(e.target.value)} />}
                </Field>
              </div>
            </div>
            {preview}
            <StepActions busy={busy} disabled={!validColor(colors.primary_color) || !validColor(colors.accent_color)} onBack={() => setStep(4)} label={t('common.continue')} onNext={() => void saveBranding()} />
          </>
        )}

        {step === 6 && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="step-title">
              {menuChoices.map(([mode, Icon]) => {
                const off = mode === 'ai' && !aiEnabled;
                const picked = menuMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    disabled={off}
                    onClick={() => {
                      setMenuMode(mode);
                      if (mode === 'ai' && !imported) setAiOpen(true);
                    }}
                    className={`card flex items-start gap-4 p-4 text-left ${mode === 'ai' ? 'sm:col-span-2' : ''} ${off ? 'cursor-not-allowed opacity-60' : picked ? '!border-ink ring-2 ring-ink' : 'hover:border-ink/40'}`}
                  >
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${picked ? 'bg-ink text-gold' : 'bg-paper'}`}>
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span className="flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-bold">
                        {t(`setup.step6.${mode}`)}
                        {mode === 'ai' && aiEnabled && <span className="rounded-full bg-gold/25 px-2 py-0.5 text-xs font-semibold">{t('setup.step6.recommended')}</span>}
                      </span>
                      <span className="block text-sm text-muted">{off ? t('menuAdmin.ai.off') : t(`setup.step6.${mode}Hint`)}</span>
                    </span>
                    {picked && <Check className="h-5 w-5" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-muted">{t('setup.step6.later')}</p>
            <StepActions busy={busy} disabled={!menuMode} onBack={() => setStep(5)} label={menuMode === 'ai' && !imported ? t('setup.step6.aiOpen') : t('common.continue')} onNext={menuNext} />
            {aiOpen && (
              <AiImportDialog
                onClose={() => setAiOpen(false)}
                onSaved={() => {
                  setAiOpen(false);
                  setImported(true);
                  void saveMenu('imported');
                }}
              />
            )}
          </>
        )}

        {step === 7 && (
          <>
            <div className="card space-y-3 p-5">
              <Field label={t('setup.step7.address')} hint={t('setup.step7.hint')} error={check.data && !check.data.available && debouncedSlug === cleanSlug ? check.data.message ?? undefined : undefined}>
                {(a) => (
                  <div className="flex items-stretch overflow-hidden rounded-xl border border-line focus-within:border-ink focus-within:ring-2 focus-within:ring-ink/10">
                    <input {...a} className="min-w-0 flex-1 bg-surface px-3.5 py-2.5 font-mono outline-none" value={slug} maxLength={40} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setSlug(e.target.value.replace(/\s+/g, '-'))} />
                    <span className="flex items-center border-l border-line bg-paper px-3 font-mono text-sm text-muted">.{PLATFORM_DOMAIN}</span>
                  </div>
                )}
              </Field>
              <p className="min-h-6 text-sm" aria-live="polite">
                {check.isFetching || debouncedSlug !== cleanSlug ? (
                  <span className="text-muted">{t('setup.step7.checking')}</span>
                ) : check.data?.available ? (
                  <span className="font-semibold text-success">✓ {t('setup.step7.available', { host: check.data.host })}</span>
                ) : check.data?.suggestion ? (
                  <button type="button" className="font-semibold text-brand underline" onClick={() => setSlug(check.data!.suggestion!)}>
                    {t('setup.step7.useSuggestion', { slug: check.data.suggestion })}
                  </button>
                ) : null}
              </p>
            </div>
            <Alert tone="info">{t('setup.step7.note')}</Alert>
            <StepActions busy={busy} disabled={!check.data?.available || debouncedSlug !== cleanSlug} onBack={() => setStep(6)} label={t('setup.step7.goLive')} onNext={() => void goLive()} />
          </>
        )}
      </motion.section>
    </AnimatePresence>
  );
}
