import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, KeyRound, Languages, Smartphone, UserRound } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatPhone, isIndianMobile } from '@/lib/format';
import { scrollToSection, useOpenParam } from '@/lib/urlParams';
import { LANGUAGES } from '@/i18n';
import { languageCode } from '@/i18n/locale';
import { useSaveLanguage, useSession, useSetSession } from '@/hooks/useSession';
import { Alert, Badge, Field, SkeletonRows, Spinner, toast } from '@/components/ui';
import { PasswordInput } from '@/components/PasswordInput';
import type { Session } from '@/types';

type Errors = Record<string, string>;

/** Field errors from the server: validation errors, or a rule error that names its field (wrong password, number taken). */
function serverErrors(e: unknown, codes: Record<string, string> = {}): { fields: Errors; message: string } {
  const err = e as ApiError;
  if (err.errors) return { fields: Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])), message: '' };
  const field = err.code ? codes[err.code] : undefined;
  return field ? { fields: { [field]: err.message }, message: '' } : { fields: {}, message: err.message };
}

function Section({ id, icon: Icon, title, children }: { id: string; icon: typeof UserRound; title: string; children: React.ReactNode }) {
  return (
    <section id={`find-${id}`} className="card space-y-4 p-5" aria-labelledby={`account-${id}`}>
      <h2 id={`account-${id}`} className="flex items-center gap-2 text-lg font-bold">
        <Icon className="h-5 w-5 text-muted" aria-hidden="true" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Details({ session }: { session: Session }) {
  const { t } = useTranslation();
  const setSession = useSetSession();
  const [name, setName] = useState(session.user.name);
  const [email, setEmail] = useState(session.user.email ?? '');
  const [current, setCurrent] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const emailChanged = email.trim().toLowerCase() !== (session.user.email ?? '');
  const needPassword = emailChanged && session.user.has_password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    if (name.trim().length < 2) errs.name = t('auth.validation.name');
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = t('auth.validation.email');
    if (needPassword && !current) errs.current_password = t('auth.validation.passwordRequired');
    setErrors(errs);
    setError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const body: Record<string, string | null> = { name: name.trim() };
      if (emailChanged) Object.assign(body, { email: email.trim() || null, current_password: current || null });
      const res = await api.patch<Session>('/account', body);
      setSession(res.data);
      setCurrent('');
      toast.success(t('myAccount.saved'));
    } catch (err) {
      const r = serverErrors(err, { wrong_password: 'current_password', email_required: 'email' });
      setErrors(r.fields);
      setError(r.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="details" icon={UserRound} title={t('myAccount.details')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label={t('auth.name')} error={errors.name}>
          {(a) => <input {...a} className="field-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t('auth.email')} optional={!session.user.email} hint={t('myAccount.emailHint')} error={errors.email}>
          {(a) => <input {...a} type="email" inputMode="email" autoComplete="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        {needPassword && (
          <Field label={t('myAccount.currentPassword')} hint={t('myAccount.currentPasswordHint')} error={errors.current_password}>
            {(a) => <PasswordInput {...a} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
          </Field>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner /> : t('common.save')}</button>
        </div>
      </form>
    </Section>
  );
}

function Mobile({ session }: { session: Session }) {
  const { t } = useTranslation();
  const setSession = useSetSession();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState<{ phone: string; devCode?: string } | null>(null);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { phone: current, phone_verified: verified } = session.user;

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const reset = () => {
    setEditing(false);
    setSent(null);
    setPhone('');
    setCode('');
    setErrors({});
    setError('');
  };

  const send = async (number: string) => {
    setErrors({});
    setError('');
    if (!isIndianMobile(number)) {
      setErrors({ phone: t('auth.validation.mobile') });
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ resend_in: number; dev_code?: string }>('/account/phone/code', { phone: number });
      setSent({ phone: number, devCode: res.data.dev_code });
      setCooldown(res.data.resend_in);
    } catch (err) {
      const r = serverErrors(err, { phone_taken: 'phone', phone_unchanged: 'phone' });
      setErrors(r.fields);
      setError(r.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code)) {
      setErrors({ code: t('auth.validation.code') });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await api.post<Session>('/account/phone/verify', { phone: sent!.phone, code });
      setSession(res.data);
      toast.success(t('myAccount.mobile.saved'));
      reset();
    } catch (err) {
      const r = serverErrors(err, { otp_invalid: 'code', phone_taken: 'code' });
      setErrors(r.fields);
      setError(r.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="mobile" icon={Smartphone} title={t('myAccount.mobile.title')}>
      <p className="text-sm text-muted">{t('myAccount.mobile.hint')}</p>
      {!editing && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {current ? (
            <p className="flex flex-wrap items-center gap-2 font-semibold tabular-nums">
              {formatPhone(current)}
              {verified ? (
                <Badge tone="paid"><BadgeCheck className="me-1 h-3.5 w-3.5" aria-hidden="true" />{t('myAccount.mobile.verified')}</Badge>
              ) : (
                <Badge tone="pending">{t('myAccount.mobile.notVerified')}</Badge>
              )}
            </p>
          ) : (
            <p className="text-muted">{t('myAccount.mobile.none')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {current && !verified && (
              <button type="button" className="btn-outline !min-h-10 text-sm" disabled={busy} onClick={() => { setEditing(true); void send(current); }}>
                {t('myAccount.mobile.verify')}
              </button>
            )}
            <button type="button" className={current ? 'btn-ghost !min-h-10 text-sm' : 'btn-primary'} onClick={() => setEditing(true)}>
              {current ? t('myAccount.mobile.change') : t('myAccount.mobile.add')}
            </button>
          </div>
        </div>
      )}
      {editing && !sent && (
        <form onSubmit={(e) => { e.preventDefault(); void send(phone); }} className="space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}
          <Field label={t('myAccount.mobile.newNumber')} error={errors.phone}>
            {(a) => (
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-muted">+91</span>
                <input {...a} type="tel" inputMode="tel" autoComplete="tel-national" className="field-input pl-12" placeholder="98290 12345" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
              </div>
            )}
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={reset}>{t('common.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner /> : t('auth.sendCode')}</button>
          </div>
        </form>
      )}
      {editing && sent && (
        <form onSubmit={verify} className="space-y-4" noValidate>
          <p className="text-sm text-muted">{t('auth.codeSentTo', { phone: formatPhone(`+91${sent.phone.replace(/\D/g, '').slice(-10)}`) })}</p>
          {sent.devCode && <Alert tone="info">{t('auth.devCode', { code: sent.devCode })}</Alert>}
          {error && <Alert>{error}</Alert>}
          <Field label={t('auth.code')} error={errors.code}>
            {(a) => <input {...a} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="field-input text-center text-xl tracking-[0.5em] tabular-nums" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />}
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="btn-ghost text-sm" disabled={cooldown > 0 || busy} onClick={() => void send(sent.phone)}>
              {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
            </button>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" onClick={reset}>{t('common.cancel')}</button>
              <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner /> : t('myAccount.mobile.verify')}</button>
            </div>
          </div>
        </form>
      )}
    </Section>
  );
}

function Password({ session }: { session: Session }) {
  const { t } = useTranslation();
  const setSession = useSetSession();
  const has = session.user.has_password;
  const [form, setForm] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    if (has && !form.current_password) errs.current_password = t('auth.validation.passwordRequired');
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) errs.password = t('auth.validation.password');
    else if (form.password !== form.password_confirmation) errs.password_confirmation = t('myAccount.password.mismatch');
    setErrors(errs);
    setError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await api.put<Session>('/account/password', { ...form, current_password: has ? form.current_password : null });
      setSession(res.data);
      setForm({ current_password: '', password: '', password_confirmation: '' });
      toast.success(t(has ? 'myAccount.password.saved' : 'myAccount.password.savedNew'));
    } catch (err) {
      const r = serverErrors(err, { wrong_password: 'current_password' });
      setErrors(r.fields);
      setError(r.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="password" icon={KeyRound} title={has ? t('myAccount.password.change') : t('myAccount.password.set')}>
      {!has && <p className="text-sm text-muted">{t('myAccount.password.setHint')}</p>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        {/* Lets password managers file the new password under the right account. */}
        <input type="text" name="username" autoComplete="username" value={session.user.email ?? session.user.phone ?? ''} readOnly hidden />
        {has && (
          <Field label={t('myAccount.currentPassword')} error={errors.current_password}>
            {(a) => <PasswordInput {...a} autoComplete="current-password" value={form.current_password} onChange={set('current_password')} />}
          </Field>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('myAccount.password.new')} hint={t('auth.passwordHint')} error={errors.password}>
            {(a) => <PasswordInput {...a} autoComplete="new-password" value={form.password} onChange={set('password')} />}
          </Field>
          <Field label={t('myAccount.password.confirm')} error={errors.password_confirmation}>
            {(a) => <PasswordInput {...a} autoComplete="new-password" value={form.password_confirmation} onChange={set('password_confirmation')} />}
          </Field>
        </div>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Spinner /> : has ? t('myAccount.password.change') : t('myAccount.password.set')}</button>
        </div>
      </form>
    </Section>
  );
}

function Language() {
  const { t, i18n } = useTranslation();
  const saveLanguage = useSaveLanguage();
  const [busy, setBusy] = useState(false);
  const current = languageCode(i18n.resolvedLanguage);
  const pick = async (code: string) => {
    setBusy(true);
    try {
      await saveLanguage(code);
      toast.success(t('myAccount.language.saved'));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="language" icon={Languages} title={t('myAccount.language.title')}>
      <p className="text-sm text-muted">{t('myAccount.language.hint')}</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" role="radiogroup" aria-label={t('myAccount.language.title')}>
        {LANGUAGES.map((l) => (
          <li key={l.code}>
            <button
              type="button"
              role="radio"
              aria-checked={current === l.code}
              lang={l.code}
              disabled={busy}
              onClick={() => current !== l.code && void pick(l.code)}
              className={`flex min-h-12 w-full items-center justify-center rounded-xl border px-3 font-semibold ${current === l.code ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink/30'}`}
              style={{ fontFamily: 'system-ui, sans-serif' }}
            >
              {l.label}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * My account: anyone signed in to the dashboard (owner or staff) edits their own name, email,
 * mobile number (verified by SMS code), password and language.
 */
export default function AccountPage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  // ?open=mobile (from the morning summary) scrolls to that card.
  useOpenParam(scrollToSection, !!session);
  if (!session) return <SkeletonRows rows={6} />;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight"><UserRound className="h-7 w-7" aria-hidden="true" /> {t('myAccount.title')}</h1>
        <p className="mt-1 text-muted">{t('myAccount.subtitle')}</p>
      </div>
      {session.support ? (
        <Alert tone="info">{t('myAccount.support')}</Alert>
      ) : (
        <>
          <Details session={session} />
          <Mobile session={session} />
          <Password session={session} />
          <Language />
        </>
      )}
    </div>
  );
}
