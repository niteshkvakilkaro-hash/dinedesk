import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Gift, Mail, Smartphone } from 'lucide-react';
import { api, ApiError, applyServerErrors } from '@/lib/api';
import { formatPhone, isIndianMobile } from '@/lib/format';
import { clearReferral, normalizeReferral, storedReferral } from '@/lib/referral';
import { useSignIn } from '@/hooks/useSession';
import { Alert, Field, Spinner } from '@/components/ui';
import { PasswordInput } from '@/components/PasswordInput';
import { LanguageToggle, Logo } from '@/components/Brand';
import { homePath } from '@/lib/home';
import type { AuthResult } from '@/types';

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <LanguageToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
          <div className="card mt-6 p-5 sm:p-6">{children}</div>
          <p className="mt-5 text-center text-sm text-muted">{footer}</p>
        </div>
      </main>
    </div>
  );
}

function MethodTabs({ value, onChange }: { value: 'email' | 'mobile'; onChange: (v: 'email' | 'mobile') => void }) {
  const { t } = useTranslation();
  return (
    <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-paper p-1" role="tablist">
      {(
        [
          ['mobile', t('auth.withMobile'), Smartphone],
          ['email', t('auth.withEmail'), Mail],
        ] as const
      ).map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`flex min-h-10 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors ${value === key ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

function useAfterAuth() {
  const signIn = useSignIn();
  const navigate = useNavigate();
  return (result: AuthResult) => {
    signIn(result);
    navigate(homePath(result.session), { replace: true });
  };
}

// ---------- Mobile OTP (works for both sign-up and sign-in) ----------

function OtpFlow() {
  const { t } = useTranslation();
  const afterAuth = useAfterAuth();
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState<{ phone: string; isNew: boolean; devCode?: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const send = async () => {
    setError('');
    setFieldErrors({});
    if (!isIndianMobile(phone)) {
      setFieldErrors({ phone: t('auth.validation.mobile') });
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ resend_in: number; is_new: boolean; dev_code?: string }>('/auth/otp/send', { phone });
      setSent({ phone, isNew: res.data.is_new, devCode: res.data.dev_code });
      setCooldown(res.data.resend_in);
    } catch (e) {
      const err = e as ApiError;
      if (err.errors?.phone) setFieldErrors({ phone: err.errors.phone[0] });
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const errs: Record<string, string> = {};
    if (!/^\d{6}$/.test(code)) errs.code = t('auth.validation.code');
    if (sent?.isNew && name.trim().length < 2) errs.name = t('auth.validation.name');
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await api.post<AuthResult>('/auth/otp/verify', { phone: sent!.phone, code, name: sent?.isNew ? name : undefined });
      afterAuth(res.data);
    } catch (e) {
      const err = e as ApiError;
      if (err.errors) setFieldErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])));
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!sent) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="space-y-4"
        noValidate
      >
        {error && <Alert>{error}</Alert>}
        <Field label={t('auth.mobile')} error={fieldErrors.phone}>
          {(a) => (
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-muted">+91</span>
              <input {...a} type="tel" inputMode="tel" autoComplete="tel-national" className="field-input pl-12" placeholder="98290 12345" value={phone} onChange={(e) => setPhone(e.target.value)} data-autofocus />
            </div>
          )}
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner /> : t('auth.sendCode')}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4" noValidate>
      <p className="text-sm text-muted">
        {t('auth.codeSentTo', { phone: formatPhone(`+91${sent.phone.replace(/\D/g, '').slice(-10)}`) })}{' '}
        <button type="button" className="font-semibold text-ink underline" onClick={() => setSent(null)}>
          {t('auth.changeNumber')}
        </button>
      </p>
      {sent.devCode && <Alert tone="info">{t('auth.devCode', { code: sent.devCode })}</Alert>}
      {error && <Alert>{error}</Alert>}
      <Field label={t('auth.code')} error={fieldErrors.code}>
        {(a) => (
          <input {...a} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="field-input text-center text-xl tracking-[0.5em] tabular-nums" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
        )}
      </Field>
      {sent.isNew && (
        <Field label={t('auth.name')} hint={t('auth.newHere')} error={fieldErrors.name}>
          {(a) => <input {...a} className="field-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
      )}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? <Spinner /> : t('auth.verify')}
      </button>
      <div className="text-center">
        <button type="button" className="btn-ghost text-sm" disabled={cooldown > 0 || busy} onClick={() => void send()}>
          {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
        </button>
      </div>
    </form>
  );
}

// ---------- Email ----------


function EmailSignup() {
  const { t } = useTranslation();
  const afterAuth = useAfterAuth();
  const [error, setError] = useState('');
  const schema = z.object({
    name: z.string().trim().min(2, t('auth.validation.name')),
    email: z.email(t('auth.validation.email')),
    password: z.string().min(8, t('auth.validation.password')).regex(/[A-Za-z]/, t('auth.validation.password')).regex(/\d/, t('auth.validation.password')),
  });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const { register, handleSubmit, setError: setFieldError, formState } = form;
  const { errors, isSubmitting } = formState;

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        setError('');
        try {
          afterAuth((await api.post<AuthResult>('/auth/register', values)).data);
        } catch (e) {
          if (!applyServerErrors(e, setFieldError as never)) setError((e as Error).message);
        }
      })}
      className="space-y-4"
      noValidate
    >
      {error && <Alert>{error}</Alert>}
      <Field label={t('auth.name')} error={errors.name?.message}>
        {(a) => <input {...a} className="field-input" autoComplete="name" {...register('name')} />}
      </Field>
      <Field label={t('auth.email')} error={errors.email?.message}>
        {(a) => <input {...a} type="email" className="field-input" autoComplete="email" {...register('email')} />}
      </Field>
      <Field label={t('auth.password')} hint={t('auth.passwordHint')} error={errors.password?.message}>
        {(a) => <PasswordInput {...a} autoComplete="new-password" {...register('password')} />}
      </Field>
      <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
        {isSubmitting ? <Spinner /> : t('auth.createAccount')}
      </button>
    </form>
  );
}

function EmailLogin() {
  const { t } = useTranslation();
  const afterAuth = useAfterAuth();
  const [error, setError] = useState('');
  const schema = z.object({ email: z.email(t('auth.validation.email')), password: z.string().min(1, t('auth.validation.passwordRequired')) });
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const { errors, isSubmitting } = formState;

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        setError('');
        try {
          afterAuth((await api.post<AuthResult>('/auth/login', values)).data);
        } catch (e) {
          setError((e as Error).message);
        }
      })}
      className="space-y-4"
      noValidate
    >
      {error && <Alert>{error}</Alert>}
      <Field label={t('auth.email')} error={errors.email?.message}>
        {(a) => <input {...a} type="email" className="field-input" autoComplete="username" {...register('email')} />}
      </Field>
      <Field label={t('auth.password')} error={errors.password?.message}>
        {(a) => <PasswordInput {...a} autoComplete="current-password" {...register('password')} />}
      </Field>
      <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
        {isSubmitting ? <Spinner /> : t('common.signIn')}
      </button>
    </form>
  );
}

/** "Invited by <business>" when the visitor came with a referral link (the server checks the code). */
function InvitedBy() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const code = normalizeReferral(new URLSearchParams(search).get('ref')) ?? storedReferral();
  const q = useQuery({
    queryKey: ['referral', code],
    enabled: !!code,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => (await api.get<{ name: string }>(`/referrals/${code}`)).data,
  });
  useEffect(() => {
    // A code that isn't valid (or a demo's) is forgotten, so it isn't sent with the business.
    if (q.error instanceof ApiError && q.error.status === 404) clearReferral();
  }, [q.error]);
  if (!q.data) return null;
  return (
    <p className="mb-5 flex items-start gap-2.5 rounded-xl border border-line bg-paper px-4 py-3 text-sm" role="status">
      <Gift className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
      <span>
        <b>{t('referrals.invitedBy', { name: q.data.name })}</b>
        <span className="block text-muted">{t('referrals.invitedHint')}</span>
      </span>
    </p>
  );
}

export function SignupPage() {
  const { t } = useTranslation();
  const [method, setMethod] = useState<'email' | 'mobile'>('mobile');
  return (
    <AuthShell
      title={t('auth.signupTitle')}
      subtitle={t('auth.signupSubtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-ink underline">
            {t('common.signIn')}
          </Link>
        </>
      }
    >
      <InvitedBy />
      <MethodTabs value={method} onChange={setMethod} />
      {method === 'mobile' ? <OtpFlow /> : <EmailSignup />}
    </AuthShell>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const [method, setMethod] = useState<'email' | 'mobile'>('email');
  return (
    <AuthShell
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="font-semibold text-ink underline">
            {t('auth.createAccount')}
          </Link>
        </>
      }
    >
      <MethodTabs value={method} onChange={setMethod} />
      {method === 'mobile' ? <OtpFlow /> : <EmailLogin />}
    </AuthShell>
  );
}
