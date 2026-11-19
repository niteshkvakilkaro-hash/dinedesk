import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BedDouble, Check, ChefHat, Coffee, Copy, ExternalLink, LayoutDashboard, Sparkles, UtensilsCrossed } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { cleanPhoneInput, isIndianMobile, mobileDigits } from '@/lib/format';
import { subdomainUrl } from '@/lib/dinedeskApp';
import { useSignIn } from '@/hooks/useSession';
import { homePath } from '@/lib/home';
import { Alert, Field, Spinner } from '@/components/ui';
import { AuthShell } from './AuthPages';
import type { AuthResult } from '@/types';

type Kind = 'restaurant' | 'cafe' | 'cloud_kitchen' | 'hotel';
type DemoResult = AuthResult & { demo: { email: string; password: string; expires_at: string; site_host: string } };

const KINDS: { key: Kind; Icon: typeof Coffee }[] = [
  { key: 'restaurant', Icon: UtensilsCrossed },
  { key: 'cafe', Icon: Coffee },
  { key: 'cloud_kitchen', Icon: ChefHat },
  { key: 'hotel', Icon: BedDouble },
];

const STEPS = 4;

/**
 * "Try live demo": name, mobile and the kind of business → the server builds a full sample
 * business on a new account (≈15 s, photos included), then shows the sign-in details to keep.
 */
export function DemoPage() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [kind, setKind] = useState<Kind>('restaurant');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const digits = mobileDigits(phone).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = t('auth.validation.name');
    if (!isIndianMobile(phone)) next.phone = t('auth.validation.mobile');
    setErrors(next);
    setError('');
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      setResult((await api.post<DemoResult>('/auth/demo', { name: name.trim(), phone, business_type: kind })).data);
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])));
      } else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (result) return <DemoReady result={result} />;

  return (
    <AuthShell
      title={t('demo.title')}
      subtitle={t('demo.subtitle')}
      footer={
        <>
          {t('demo.realAccount')}{' '}
          <Link to="/signup" className="font-semibold text-ink underline">
            {t('auth.createAccount')}
          </Link>
        </>
      }
    >
      {busy ? (
        <Building />
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}
          <Field label={t('auth.name')} error={errors.name}>
            {(a) => <input {...a} className="field-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label={t('demo.mobile')} hint={digits > 0 && digits < 10 ? t('auth.digits', { count: digits }) : t('demo.mobileHint')} error={errors.phone}>
            {(a) => <input {...a} className="field-input" type="tel" inputMode="tel" autoComplete="tel" maxLength={16} placeholder="98765 43210" value={phone} onChange={(e) => setPhone(cleanPhoneInput(e.target.value))} />}
          </Field>
          <fieldset>
            <legend className="field-label">{t('demo.kind')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map(({ key, Icon }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={kind === key}
                  onClick={() => setKind(key)}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-2 text-sm font-semibold transition-colors ${kind === key ? 'border-brand bg-brand/10 text-ink' : 'border-line text-muted hover:border-ink/30 hover:text-ink'}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {t(`types.${key}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="btn-brand w-full">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            {t('demo.submit')}
          </button>
          <p className="text-center text-xs text-muted">{t('demo.note')}</p>
        </form>
      )}
    </AuthShell>
  );
}

/** While the server builds the demo: the steps tick by (the request takes ~15 s). */
function Building() {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS - 1)), 3800);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="py-2" role="status" aria-live="polite">
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-paper">
        <div className="h-full rounded-full bg-brand transition-all duration-[3500ms] ease-out" style={{ width: `${((step + 1) / STEPS) * 92}%` }} />
      </div>
      <ul className="space-y-3">
        {Array.from({ length: STEPS }, (_, i) => (
          <li key={i} className={`flex items-center gap-3 text-sm ${i <= step ? 'text-ink' : 'text-muted/60'}`}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${i < step ? 'bg-brand text-white' : i === step ? 'border-2 border-brand' : 'border border-line'}`}>
              {i < step ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i === step ? <Spinner /> : null}
            </span>
            {t(`demo.steps.${i}`)}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-center text-xs text-muted">{t('demo.wait')}</p>
    </div>
  );
}

function DemoReady({ result }: { result: DemoResult }) {
  const { t, i18n } = useTranslation();
  const signIn = useSignIn();
  const navigate = useNavigate();
  const [copied, setCopied] = useState('');
  const slug = result.session.tenant?.slug;
  const until = new Date(result.demo.expires_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' });

  const copy = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    });
  };
  const open = () => {
    signIn(result);
    navigate(homePath(result.session), { replace: true });
  };

  return (
    <AuthShell title={t('demo.readyTitle')} subtitle={t('demo.readySubtitle', { date: until })} footer={t('demo.keep')}>
      <dl className="space-y-3">
        {(
          [
            ['email', t('auth.email'), result.demo.email],
            ['password', t('auth.password'), result.demo.password],
          ] as const
        ).map(([key, label, value]) => (
          <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3">
            <div className="min-w-0">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="truncate font-mono text-[15px] font-semibold">{value}</dd>
            </div>
            <button type="button" className="btn-ghost !min-h-9 !px-2.5" onClick={() => copy(key, value)} aria-label={t('demo.copy', { what: label })}>
              {copied === key ? <Check className="h-4 w-4 text-brand" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        ))}
      </dl>
      <button type="button" className="btn-brand mt-5 w-full" onClick={open}>
        <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
        {t('demo.open')}
      </button>
      {slug && (
        <a href={subdomainUrl(slug)} target="_blank" rel="noreferrer" className="btn-outline mt-2 w-full">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t('demo.site')}
        </a>
      )}
    </AuthShell>
  );
}
