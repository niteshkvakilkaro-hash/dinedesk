import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, Bot, CreditCard, Mail, MessageCircle, MessageSquareText, Radio, Smartphone } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Alert, Badge, Dialog, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';
import { PasswordInput } from '@/components/PasswordInput';

type Source = 'saved' | 'env' | 'unset';
interface FieldInfo { secret: boolean; source: Source; updated_at: string | null; value?: string | null; set?: boolean; last4?: string | null }
type Key = 'razorpay' | 'ai' | 'whatsapp' | 'sms' | 'messaging' | 'mail' | 'webpush' | 'firebase';
interface IntegrationsData {
  integrations: Record<Key, Record<string, FieldInfo>>;
  ready: Record<'razorpay' | 'ai' | 'whatsapp' | 'sms' | 'mail' | 'webpush' | 'firebase', boolean>;
  /** The Firebase key in use: its project and account (the private key never leaves the server). */
  firebase: { project_id: string; client_email: string } | null;
  mailer: string;
  webhook_url: string;
  webhook_events: string[];
}
interface TestResult { ok: boolean; message: string }

const QK = ['platform', 'integrations'];

interface FieldSpec { name: string; type?: 'number' | 'email' | 'select'; options?: string[]; mono?: boolean }
interface CardSpec { key: 'razorpay' | 'ai' | 'whatsapp' | 'sms' | 'mail'; icon: typeof Bot; fields: FieldSpec[]; test?: 'phone' | 'email' | 'none' }

const CARDS: CardSpec[] = [
  { key: 'razorpay', icon: CreditCard, test: 'none', fields: [{ name: 'key_id', mono: true }, { name: 'key_secret' }, { name: 'webhook_secret' }] },
  { key: 'ai', icon: Bot, test: 'none', fields: [{ name: 'api_key' }, { name: 'model', mono: true }] },
  { key: 'whatsapp', icon: MessageCircle, test: 'phone', fields: [{ name: 'token' }, { name: 'phone_number_id', mono: true }, { name: 'template', mono: true }, { name: 'language', mono: true }, { name: 'api_version', mono: true }] },
  { key: 'sms', icon: MessageSquareText, test: 'phone', fields: [{ name: 'auth_key' }, { name: 'otp_template_id', mono: true }, { name: 'code_variable', mono: true }] },
  {
    key: 'mail',
    icon: Mail,
    test: 'email',
    fields: [{ name: 'host', mono: true }, { name: 'port', type: 'number' }, { name: 'encryption', type: 'select', options: ['tls', 'ssl', 'none'] }, { name: 'username' }, { name: 'password' }, { name: 'from_address', type: 'email' }, { name: 'from_name' }],
  },
];

const errorText = (e: ApiError) => (e.errors ? Object.values(e.errors)[0][0] : e.message);

/** Where a value comes from: saved in this panel, the server .env, or nowhere. */
function SourceBadge({ info }: { info: FieldInfo }) {
  const { t } = useTranslation();
  const tone = { saved: 'live', env: 'completed', unset: 'read_only' }[info.source];
  return (
    <span title={info.updated_at ? t('platform.integrations.savedAt', { time: formatDateTime(info.updated_at) }) : undefined}>
      <Badge tone={tone}>{t(`platform.integrations.source.${info.source}`)}</Badge>
    </span>
  );
}

function ReadyBadge({ ready }: { ready: boolean }) {
  const { t } = useTranslation();
  return <Badge tone={ready ? 'live' : 'read_only'}>{ready ? t('platform.integrations.ready') : t('platform.integrations.notReady')}</Badge>;
}

function Card({ icon: Icon, title, text, badge, children }: { icon: typeof Bot; title: string; text: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Icon className="h-5 w-5 shrink-0" aria-hidden="true" /> {title}</h2>
          <p className="mt-1 text-sm text-muted">{text}</p>
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

/** "Test": a real call with the saved keys; the answer is shown in the card. */
function TestBox({ integration, kind }: { integration: string; kind: 'phone' | 'email' | 'none' }) {
  const { t } = useTranslation();
  const [to, setTo] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const test = useMutation<TestResult, ApiError>({
    mutationFn: async () => (await api.post<TestResult>(`/platform/integrations/${integration}/test`, kind === 'phone' ? { phone: to } : kind === 'email' ? { email: to } : {})).data,
    onSuccess: setResult,
    onError: (e) => setResult({ ok: false, message: errorText(e) }),
  });
  return (
    <div className="space-y-2 border-t border-line pt-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setResult(null); test.mutate(); }} noValidate>
        {kind !== 'none' && (
          <Field className="min-w-[200px] flex-1" label={kind === 'phone' ? t('platform.integrations.testPhone') : t('platform.integrations.testEmail')}>
            {(a) => <input {...a} className="field-input" type={kind === 'phone' ? 'tel' : 'email'} inputMode={kind === 'phone' ? 'tel' : 'email'} maxLength={kind === 'phone' ? 20 : 160} value={to} onChange={(e) => setTo(e.target.value)} />}
          </Field>
        )}
        <button type="submit" className="btn-outline" disabled={test.isPending || (kind !== 'none' && !to.trim())}>
          {test.isPending ? <Spinner /> : kind === 'none' ? t('platform.integrations.test') : t('platform.integrations.sendTest')}
        </button>
      </form>
      <p className="text-xs text-muted">{t('platform.integrations.testHint')}</p>
      {result && <Alert tone={result.ok ? 'success' : 'danger'}>{result.message}</Alert>}
    </div>
  );
}

/** One integration's form: plain fields show their value, secrets only "set" and the last 4 characters. */
function IntegrationForm({ spec, data }: { spec: CardSpec; data: IntegrationsData }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const info = data.integrations[spec.key];
  const initial = Object.fromEntries(spec.fields.map((f) => [f.name, info[f.name].secret || info[f.name].source !== 'saved' ? '' : (info[f.name].value ?? '')]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [remove, setRemove] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const changed = spec.fields.filter((f) => (info[f.name].secret ? values[f.name].trim() !== '' : values[f.name] !== initial[f.name])).map((f) => f.name);
  const needsPassword = spec.fields.some((f) => info[f.name].secret && (values[f.name].trim() !== '' || remove.includes(f.name)));
  const save = useMutation<IntegrationsData, ApiError>({
    mutationFn: async () => (await api.put<IntegrationsData>(`/platform/integrations/${spec.key}`, {
      values: Object.fromEntries(changed.map((n) => [n, values[n].trim()])),
      remove,
      ...(needsPassword && { current_password: password }),
    })).data,
    onSuccess: (d) => {
      qc.setQueryData(QK, d);
      setErrors({});
      setPassword('');
      toast.success(t('common.saved'));
    },
    onError: (e) => setErrors(e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k.replace(/^values\./, ''), v[0]])) : { form: e.message }),
  });

  const label = (name: string) => t(`platform.integrations.${spec.key}.${name}`);
  const control = (f: FieldSpec) => {
    const fi = info[f.name];
    const removing = remove.includes(f.name);
    if (fi.secret) {
      const placeholder = removing ? t('platform.integrations.willRemove') : fi.set ? (fi.last4 ? `•••• ${fi.last4}` : '••••••••') : t('platform.integrations.source.unset');
      return (
        <Field key={f.name} label={label(f.name)} hint={fi.set ? t('platform.integrations.keepHint') : undefined} error={errors[f.name]}>
          {(a) => (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2"><SourceBadge info={fi} /></div>
              <PasswordInput {...a} autoComplete="new-password" spellCheck={false} placeholder={placeholder} disabled={removing} value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
              {fi.source === 'saved' && (
                <button type="button" className="text-sm font-semibold text-danger underline-offset-2 hover:underline" onClick={() => setRemove(removing ? remove.filter((n) => n !== f.name) : [...remove, f.name])}>
                  {removing ? t('platform.integrations.undoRemove') : t('platform.integrations.remove')}
                </button>
              )}
            </div>
          )}
        </Field>
      );
    }
    const server = fi.source === 'env' ? fi.value : null;
    const placeholder = server ? t('platform.integrations.serverValue', { value: f.name === 'encryption' ? t(`platform.integrations.mail.enc.${server}`) : server }) : '';
    return (
      <Field key={f.name} label={label(f.name)} error={errors[f.name]} hint={values[f.name] === '' && server ? t('platform.integrations.emptyUsesServer') : undefined}>
        {(a) => (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2"><SourceBadge info={fi} /></div>
            {f.type === 'select' ? (
              <select {...a} className="field-input" value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                <option value="">{server ? placeholder : t('platform.integrations.mail.enc.default')}</option>
                {f.options!.map((o) => <option key={o} value={o}>{t(`platform.integrations.mail.enc.${o}`)}</option>)}
              </select>
            ) : (
              <input {...a} className={`field-input ${f.mono ? 'font-mono text-sm' : ''}`} type={f.type ?? 'text'} inputMode={f.type === 'number' ? 'numeric' : undefined} spellCheck={false} autoComplete="off" placeholder={placeholder} value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
            )}
          </div>
        )}
      </Field>
    );
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
      {errors.form && <Alert>{errors.form}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{spec.fields.map(control)}</div>
      {needsPassword && (
        <Field label={t('platform.integrations.password')} hint={t('platform.integrations.passwordHint')} error={errors.current_password}>
          {(a) => <PasswordInput {...a} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
      )}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={save.isPending || (!changed.length && !remove.length) || (needsPassword && !password)}>
          {save.isPending ? <Spinner /> : t('common.save')}
        </button>
      </div>
    </form>
  );
}

/** Log only (development) or Live (real WhatsApp messages and SMS codes). */
function MessagingMode({ data }: { data: IntegrationsData }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fi = data.integrations.messaging.driver;
  const current = fi.value === 'live' ? 'live' : 'log';
  const [mode, setMode] = useState(current);
  const save = useMutation<IntegrationsData, ApiError>({
    mutationFn: async () => (await api.put<IntegrationsData>('/platform/integrations/messaging', { values: { driver: mode } })).data,
    onSuccess: (d) => { qc.setQueryData(QK, d); toast.success(t('common.saved')); },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <Card icon={Radio} title={t('platform.integrations.messaging.title')} text={t('platform.integrations.messaging.text')} badge={<SourceBadge info={fi} />}>
      <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <legend className="sr-only">{t('platform.integrations.messaging.title')}</legend>
        {(['log', 'live'] as const).map((m) => (
          <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 ${mode === m ? 'border-brand bg-brand/5' : 'border-line'}`}>
            <input type="radio" name="messaging-mode" className="mt-1" checked={mode === m} onChange={() => setMode(m)} />
            <span>
              <span className="block font-semibold">{t(`platform.integrations.messaging.${m}`)}</span>
              <span className="block text-sm text-muted">{t(`platform.integrations.messaging.${m}Hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {mode === 'live' && <Alert tone="warn">{t('platform.integrations.messaging.liveWarning')}</Alert>}
      <div className="flex justify-end">
        <button type="button" className="btn-primary" disabled={save.isPending || mode === current} onClick={() => save.mutate()}>
          {save.isPending ? <Spinner /> : t('common.save')}
        </button>
      </div>
    </Card>
  );
}

/** Web push keys: generated here (the same as php artisan webpush:vapid). */
function WebPush({ data }: { data: IntegrationsData }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const pub = data.integrations.webpush.public_key;
  const ready = data.ready.webpush;
  const gen = useMutation<IntegrationsData, ApiError>({
    mutationFn: async () => (await api.post<IntegrationsData>('/platform/integrations/webpush/generate', { current_password: password })).data,
    onSuccess: (d) => { qc.setQueryData(QK, d); setOpen(false); setPassword(''); setError(''); toast.success(t('platform.integrations.webpush.generated')); },
    onError: (e) => setError(errorText(e)),
  });
  return (
    <Card icon={Bell} title={t('platform.integrations.webpush.title')} text={t('platform.integrations.webpush.text')} badge={<ReadyBadge ready={ready} />}>
      {ready && pub.value ? (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2"><span className="font-semibold">{t('platform.integrations.webpush.public_key')}</span> <SourceBadge info={pub} /></div>
          <code className="block break-all rounded bg-ink/5 px-2 py-1 font-mono text-xs">{pub.value}</code>
        </div>
      ) : (
        <p className="text-sm">{t('platform.integrations.webpush.none')}</p>
      )}
      <button type="button" className="btn-outline" onClick={() => setOpen(true)}>{ready ? t('platform.integrations.webpush.regenerate') : t('platform.integrations.webpush.generate')}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={ready ? t('platform.integrations.webpush.regenerate') : t('platform.integrations.webpush.generate')}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); gen.mutate(); }} noValidate>
          {ready && <Alert tone="warn">{t('platform.integrations.webpush.warning')}</Alert>}
          {error && <Alert>{error}</Alert>}
          <Field label={t('platform.integrations.password')} hint={t('platform.integrations.passwordHint')}>
            {(a) => <PasswordInput {...a} data-autofocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={!password || gen.isPending}>{gen.isPending ? <Spinner /> : t('platform.integrations.webpush.generate')}</button>
        </form>
      </Dialog>
    </Card>
  );
}

/**
 * Firebase (notifications in the DineDesk Android app): the service-account key JSON, pasted or
 * read from the downloaded file. Shown afterwards only as its project and account.
 */
function Firebase({ data }: { data: IntegrationsData }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fi = data.integrations.firebase.credentials;
  const [json, setJson] = useState('');
  const [removing, setRemoving] = useState(false);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation<IntegrationsData, ApiError>({
    mutationFn: async () => (await api.put<IntegrationsData>('/platform/integrations/firebase', {
      values: removing ? {} : { credentials: json.trim() },
      remove: removing ? ['credentials'] : [],
      current_password: password,
    })).data,
    onSuccess: (d) => {
      qc.setQueryData(QK, d);
      setJson('');
      setRemoving(false);
      setPassword('');
      setErrors({});
      toast.success(t('common.saved'));
    },
    onError: (e) => setErrors(e.errors ? Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k.replace(/^values\./, ''), v[0]])) : { form: e.message }),
  });
  const readFile = (file: File | undefined) => {
    if (!file || file.size > 20_000) return;
    void file.text().then(setJson);
  };
  const dirty = removing || json.trim() !== '';

  return (
    <Card icon={Smartphone} title={t('platform.integrations.firebase.title')} text={t('platform.integrations.firebase.text')} badge={<ReadyBadge ready={data.ready.firebase} />}>
      {data.firebase ? (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold">{t('platform.integrations.firebase.project')}</dt>
          <dd className="break-all font-mono text-xs">{data.firebase.project_id}</dd>
          <dt className="font-semibold">{t('platform.integrations.firebase.account')}</dt>
          <dd className="break-all font-mono text-xs">{data.firebase.client_email}</dd>
          <dt className="sr-only">{t('platform.integrations.firebase.credentials')}</dt>
          <dd className="sm:col-start-2"><SourceBadge info={fi} /></dd>
        </dl>
      ) : (
        <p className="text-sm">{t('platform.integrations.firebase.none')}</p>
      )}
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
        {errors.form && <Alert>{errors.form}</Alert>}
        <Field label={t('platform.integrations.firebase.credentials')} hint={t('platform.integrations.firebase.pasteHint')} error={errors.credentials}>
          {(a) => (
            <div className="space-y-2">
              <textarea {...a} className="field-input min-h-28 font-mono text-xs" spellCheck={false} autoComplete="off" disabled={removing} placeholder={fi.set ? '••••••••' : '{ "type": "service_account", … }'} value={json} onChange={(e) => setJson(e.target.value)} />
              <div className="flex flex-wrap items-center gap-3">
                <label className="btn-outline cursor-pointer !min-h-10 text-sm">
                  {t('platform.integrations.firebase.chooseFile')}
                  <input type="file" accept=".json,application/json" className="sr-only" disabled={removing} onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {fi.source === 'saved' && (
                  <button type="button" className="text-sm font-semibold text-danger underline-offset-2 hover:underline" onClick={() => { setRemoving(!removing); setJson(''); }}>
                    {removing ? t('platform.integrations.undoRemove') : t('platform.integrations.remove')}
                  </button>
                )}
              </div>
            </div>
          )}
        </Field>
        {dirty && (
          <Field label={t('platform.integrations.password')} hint={t('platform.integrations.passwordHint')} error={errors.current_password}>
            {(a) => <PasswordInput {...a} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={save.isPending || !dirty || !password}>
            {save.isPending ? <Spinner /> : t('common.save')}
          </button>
        </div>
      </form>
      <p className="text-xs text-muted">{t('platform.integrations.firebase.appBuild')}</p>
      <div className="space-y-1">
        <TestBox integration="firebase" kind="none" />
        <p className="text-xs text-muted">{t('platform.integrations.firebase.testHint')}</p>
      </div>
    </Card>
  );
}

/** Super admin → Integrations: the platform's own payment, AI, messaging, email and push keys. */
export default function IntegrationsPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: QK, queryFn: async () => (await api.get<IntegrationsData>('/platform/integrations')).data });
  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.isError || !q.data) return <ErrorState message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const data = q.data;
  const card = (spec: CardSpec, extra?: ReactNode) => (
    <Card key={spec.key} icon={spec.icon} title={t(`platform.integrations.${spec.key}.title`)} text={t(`platform.integrations.${spec.key}.text`)} badge={<ReadyBadge ready={data.ready[spec.key]} />}>
      {extra}
      {/* Re-mounted after a save so the form starts from what is saved now. */}
      <IntegrationForm key={JSON.stringify(data.integrations[spec.key])} spec={spec} data={data} />
      {spec.test && <TestBox integration={spec.key} kind={spec.test} />}
    </Card>
  );
  const [razorpay, ai, whatsapp, sms, mail] = CARDS;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t('platform.integrations.title')}</h1>
        <p className="text-muted">{t('platform.integrations.subtitle')}</p>
      </div>
      <Alert tone="info">{t('platform.integrations.howItWorks')}</Alert>
      {card(razorpay, (
        <div className="space-y-1 text-sm">
          <p>{t('platform.integrations.razorpay.webhook')} <code className="break-all rounded bg-ink/5 px-1.5 py-0.5">{data.webhook_url}</code></p>
          <p className="text-muted">{t('platform.integrations.razorpay.events')} <span className="font-mono text-xs">{data.webhook_events.join(', ')}</span></p>
        </div>
      ))}
      {card(ai)}
      <MessagingMode key={data.integrations.messaging.driver.value ?? ''} data={data} />
      {card(whatsapp)}
      {card(sms)}
      {card(mail, <p className="text-sm">{t('platform.integrations.mail.current', { mailer: data.mailer })}</p>)}
      <WebPush data={data} />
      <Firebase key={JSON.stringify([data.firebase, data.integrations.firebase])} data={data} />
    </div>
  );
}
