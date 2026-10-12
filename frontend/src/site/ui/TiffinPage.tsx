import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useMoney } from '../ordering';
import type { SiteData } from '../types';
import { PageHeader } from './pages';

interface Plan { id: number; name: string; description: string | null; diet: 'veg' | 'non_veg' | null; slot: 'lunch' | 'dinner' | 'both'; meals: number; days_valid: number; price: string }

function ErrorText({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <span id={id} role="alert" className="mt-1.5 block text-sm font-semibold text-[var(--s-error)]">
      {children}
    </span>
  );
}

const localToday = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

/** Tiffin / meal plans: pick one and ask to join; the restaurant calls to confirm and take payment. */
export function TiffinPage({ site }: { site: SiteData }) {
  const { t } = useTranslation();
  const money = useMoney();
  const plans = useQuery({ queryKey: ['site', 'tiffin'], queryFn: async () => (await api.get<Plan[]>('/site/tiffin/plans')).data });
  const today = localToday(site.timezone);
  const [chosen, setChosen] = useState<Plan | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', slot: 'both', starts_on: today, notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ code: string; plan: string | null; starts_on: string } | null>(null);
  const wa = site.content.contact?.whatsapp;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    setSending(true);
    setErrors({});
    setFormError('');
    try {
      const r = await api.post<{ code: string; plan: string | null; starts_on: string }>('/site/tiffin/request', {
        meal_plan_id: chosen.id, ...form, slot: chosen.slot === 'both' ? form.slot : null, notes: form.notes || null,
      });
      setDone(r.data);
      window.scrollTo({ top: 0 });
    } catch (err) {
      const ae = err as ApiError;
      if (ae.errors) setErrors(Object.fromEntries(Object.entries(ae.errors).map(([k, v]) => [k, v[0]])));
      setFormError(ae.message);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <>
        <PageHeader site={site} eyebrow={site.name} title={t('site.tiffin.doneTitle')} />
        <div className="s-wrap max-w-3xl pb-20" aria-live="polite">
          <div className="s-card p-6 sm:p-8">
            <p className="s-eyebrow">{t('site.tiffin.requestId')}</p>
            <p className="s-h2 mt-1">{done.code}</p>
            <p className="mt-4">{t('site.tiffin.doneText', { plan: done.plan ?? '', name: site.name })}</p>
            {wa && (
              <a className="s-btn s-btn-primary mt-6" href={`https://wa.me/${wa.replace(/\D+/g, '').replace(/^(\d{10})$/, '91$1')}?text=${encodeURIComponent(t('site.tiffin.waText', { code: done.code, plan: done.plan ?? '' }))}`} target="_blank" rel="noreferrer">
                {t('site.tiffin.whatsapp')}
              </a>
            )}
          </div>
        </div>
      </>
    );
  }

  const input = (key: 'name' | 'phone' | 'notes', label: string, props: React.InputHTMLAttributes<HTMLInputElement>, optional = false) => (
    <label className="block">
      <span className="text-sm font-bold">
        {label}
        {optional && <span className="s-muted font-normal"> ({t('order.optional')})</span>}
      </span>
      <input {...props} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `tf-err-${key}` : undefined} className="s-input mt-1.5" />
      <ErrorText id={`tf-err-${key}`}>{errors[key]}</ErrorText>
    </label>
  );

  const list = plans.data ?? [];
  return (
    <>
      <PageHeader site={site} eyebrow={site.name} title={t('site.tiffin.title')} lead={t('site.tiffin.lead')} />
      <div className="s-wrap pb-20">
        {plans.isLoading && <p className="s-muted"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />{t('common.loading')}</p>}
        {!plans.isLoading && !list.length && <p className="s-muted">{t('site.tiffin.none')}</p>}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={t('site.tiffin.pick')}>
          {list.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={chosen?.id === p.id}
              onClick={() => setChosen(p)}
              className={`s-reveal s-card p-6 text-left transition ${chosen?.id === p.id ? 'ring-2 ring-[var(--t-primary)]' : ''}`}
              style={{ ['--i' as string]: i % 3 }}
            >
              <p className="s-small s-muted font-semibold uppercase tracking-wider">
                {t(`site.tiffin.slot.${p.slot}`)}
                {p.diet && ` · ${t(p.diet === 'veg' ? 'site.tiffin.veg' : 'site.tiffin.nonVeg')}`}
              </p>
              <h2 className="s-h3 mt-2">{p.name}</h2>
              {p.description && <p className="s-muted mt-2">{p.description}</p>}
              <p className="s-h2 mt-4">{money(p.price)}</p>
              <p className="s-small s-muted">{t('site.tiffin.summary', { meals: p.meals, days: p.days_valid, per: money(Math.round(Number(p.price) / p.meals)) })}</p>
            </button>
          ))}
        </div>

        {chosen && (
          <form className="s-card mt-8 max-w-3xl p-5 sm:p-6" onSubmit={submit} noValidate>
            <h2 className="s-h3">{t('site.tiffin.formTitle', { plan: chosen.name })}</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {input('name', t('site.tiffin.name'), { autoComplete: 'name', maxLength: 120 })}
              {input('phone', t('site.tiffin.phone'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel' })}
              <label className="block sm:col-span-2">
                <span className="text-sm font-bold">{t('site.tiffin.address')}</span>
                <textarea rows={2} maxLength={300} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} aria-invalid={!!errors.address} aria-describedby={errors.address ? 'tf-err-address' : undefined} className="s-input mt-1.5" autoComplete="street-address" />
                <ErrorText id="tf-err-address">{errors.address}</ErrorText>
              </label>
              <label className="block">
                <span className="text-sm font-bold">{t('site.tiffin.startsOn')}</span>
                <input type="date" min={today} value={form.starts_on} onChange={(e) => setForm((f) => ({ ...f, starts_on: e.target.value }))} aria-invalid={!!errors.starts_on} aria-describedby={errors.starts_on ? 'tf-err-starts_on' : undefined} className="s-input mt-1.5" />
                <ErrorText id="tf-err-starts_on">{errors.starts_on}</ErrorText>
              </label>
              {chosen.slot === 'both' && (
                <label className="block">
                  <span className="text-sm font-bold">{t('site.tiffin.meal')}</span>
                  <select value={form.slot} onChange={(e) => setForm((f) => ({ ...f, slot: e.target.value }))} className="s-input mt-1.5">
                    {(['both', 'lunch', 'dinner'] as const).map((s) => <option key={s} value={s}>{t(`site.tiffin.slot.${s}`)}</option>)}
                  </select>
                </label>
              )}
              <div className="sm:col-span-2">{input('notes', t('site.tiffin.notes'), { maxLength: 300, placeholder: t('site.tiffin.notesPlaceholder') }, true)}</div>
            </div>
            {formError && !Object.keys(errors).length && <p role="alert" className="mt-4 text-sm font-semibold text-[var(--s-error)]">{formError}</p>}
            <p className="s-small s-muted mt-4">{t('site.tiffin.payNote')}</p>
            <button type="submit" className="s-btn s-btn-primary mt-5" disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('site.tiffin.send')}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
