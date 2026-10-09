import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BedDouble, Check, Coffee, Truck, UtensilsCrossed } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { GSTIN_REGEX } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { Alert, Field, Spinner } from '@/components/ui';
import { LanguageToggle, Logo } from '@/components/Brand';
import { defaultHours, HoursEditor, validateHours } from '@/components/HoursEditor';
import type { BusinessType, DayKey, OpeningHours, Session } from '@/types';

const STEP_KEYS = ['account', 'type', 'details', 'theme', 'branding', 'menu', 'live'] as const;
const TYPE_ICONS: Record<BusinessType, typeof UtensilsCrossed> = { restaurant: UtensilsCrossed, cafe: Coffee, cloud_kitchen: Truck, hotel: BedDouble };

function Progress({ step }: { step: number }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('onboarding.stepOf', { step, total: 7 })}>
      <p className="text-sm font-semibold text-muted">{t('onboarding.stepOf', { step, total: 7 })}</p>
      <ol className="mt-3 grid grid-cols-7 gap-1.5">
        {STEP_KEYS.map((key, i) => {
          const n = i + 1;
          const state = n < step ? 'done' : n === step ? 'current' : n <= 3 ? 'todo' : 'later';
          return (
            <li key={key} aria-current={state === 'current' ? 'step' : undefined} className="min-w-0">
              <span className={`block h-1.5 rounded-full ${state === 'done' ? 'bg-ink' : state === 'current' ? 'bg-brand' : 'bg-line'}`} />
              <span className={`mt-1.5 hidden truncate text-xs sm:block ${state === 'current' ? 'font-bold text-ink' : 'text-muted'}`}>
                {t(`onboarding.steps.${key}`)}
                {state === 'later' && <span className="sr-only"> ({t('common.comingSoon')})</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function OnboardingWizard() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  const [step, setStep] = useState<2 | 3>(2);
  const [type, setType] = useState<BusinessType | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [gstin, setGstin] = useState('');
  const [hours, setHours] = useState<OpeningHours>(defaultHours);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hourErrors, setHourErrors] = useState<Partial<Record<DayKey, string>>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = t('onboarding.validation.name');
    if (city.trim().length < 2) errs.city = t('onboarding.validation.city');
    const cleanGstin = gstin.replace(/\s+/g, '').toUpperCase();
    if (cleanGstin && !GSTIN_REGEX.test(cleanGstin)) errs.gstin = t('onboarding.validation.gstin');
    const hErrs = validateHours(hours, t);
    setErrors(errs);
    setHourErrors(hErrs);
    if (Object.keys(errs).length || Object.keys(hErrs).length) return;

    setBusy(true);
    try {
      const res = await api.post<Session>('/onboarding/business', { business_type: type, name, city, gstin: cleanGstin || null, opening_hours: hours });
      qc.setQueryData(['session', token], res.data);
      navigate('/dashboard', { replace: true, state: { welcome: true } });
    } catch (e) {
      const err = e as ApiError;
      if (err.errors) setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])));
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const slide = reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 } };

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <LanguageToggle />
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-4">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('onboarding.title')}</h1>
        <div className="mt-5">
          <Progress step={step} />
        </div>

        <AnimatePresence mode="wait">
          {step === 2 ? (
            <motion.section key="type" {...slide} transition={{ duration: 0.3 }} className="mt-8" aria-labelledby="type-title">
              <h2 id="type-title" className="text-xl font-bold">
                {t('onboarding.typeTitle')}
              </h2>
              <p className="text-muted">{t('onboarding.typeSubtitle')}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="type-title">
                {(Object.keys(TYPE_ICONS) as BusinessType[]).map((key) => {
                  const Icon = TYPE_ICONS[key];
                  const selected = type === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setType(key)}
                      className={`card flex items-center gap-4 p-4 text-left transition-[border-color,box-shadow] ${selected ? '!border-ink ring-2 ring-ink' : 'hover:border-ink/40'}`}
                    >
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-ink text-gold' : 'bg-paper text-ink'}`}>
                        <Icon className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <span className="flex-1">
                        <span className="block font-bold">{t(`types.${key}`)}</span>
                        <span className="block text-sm text-muted">{t(`typeHints.${key}`)}</span>
                      </span>
                      {selected && <Check className="h-5 w-5" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-end">
                <button type="button" className="btn-primary" disabled={!type} onClick={() => setStep(3)}>
                  {t('common.continue')}
                </button>
              </div>
            </motion.section>
          ) : (
            <motion.form key="details" {...slide} transition={{ duration: 0.3 }} onSubmit={submit} className="mt-8 space-y-5" noValidate aria-labelledby="details-title">
              <div>
                <h2 id="details-title" className="text-xl font-bold">
                  {t('onboarding.detailsTitle')}
                </h2>
                <p className="text-muted">{t('onboarding.detailsSubtitle')}</p>
              </div>
              {error && <Alert>{error}</Alert>}
              <div className="card space-y-5 p-5">
                <Field label={t('onboarding.businessName')} error={errors.name}>
                  {(a) => <input {...a} className="field-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" autoFocus />}
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label={t('onboarding.city')} error={errors.city}>
                    {(a) => <input {...a} className="field-input" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />}
                  </Field>
                  <Field label={t('onboarding.gstin')} optional hint={t('onboarding.gstinHint')} error={errors.gstin}>
                    {(a) => <input {...a} className="field-input uppercase" maxLength={15} value={gstin} onChange={(e) => setGstin(e.target.value)} />}
                  </Field>
                </div>
                <HoursEditor value={hours} onChange={setHours} errors={hourErrors} />
              </div>
              <p className="text-sm text-muted">{t('onboarding.nextSteps')}</p>
              <div className="flex justify-between gap-3">
                <button type="button" className="btn-outline" onClick={() => setStep(2)}>
                  {t('common.back')}
                </button>
                <button type="submit" className="btn-brand" disabled={busy}>
                  {busy ? <Spinner /> : t('onboarding.create')}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
