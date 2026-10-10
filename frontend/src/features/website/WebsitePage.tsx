import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { tenantSiteUrl } from '@/lib/host';
import { isIndianMobile } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { Alert, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';
import type { ThemeKey } from '@/themes/types';
import type { SectionKey } from '@/site/types';
import { useSaveContent, useSaveTheme, useWebsite, type EditableContent } from './api';
import { ColorFields, LivePreview, SectionOrder, ThemeCards, validColor } from './ThemePicker';
import { ImageUpload } from './ImageUpload';

type Tab = 'design' | 'images' | 'content';

function DesignTab() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const { data } = useWebsite();
  const save = useSaveTheme();
  const [theme, setTheme] = useState<ThemeKey>('haveli');
  const [colors, setColors] = useState<{ primary_color: string | null; accent_color: string | null }>({ primary_color: null, accent_color: null });
  const [sections, setSections] = useState<{ key: SectionKey; visible: boolean }[]>([]);

  useEffect(() => {
    if (!data) return;
    setTheme(data.theme.key);
    setColors({ primary_color: data.theme.primary_color, accent_color: data.theme.accent_color });
    setSections(data.theme.sections);
  }, [data]);

  if (!data || !session?.tenant) return null;
  const dirty =
    theme !== data.theme.key ||
    colors.primary_color !== data.theme.primary_color ||
    colors.accent_color !== data.theme.accent_color ||
    JSON.stringify(sections) !== JSON.stringify(data.theme.sections);
  const valid = validColor(colors.primary_color) && validColor(colors.accent_color);

  const submit = () =>
    save.mutate(
      { key: theme, ...colors, sections },
      {
        onSuccess: () => toast.success(t('website.saved')),
        onError: (e) => toast.error((e as ApiError).message),
      },
    );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">
        <section className="card p-5" aria-labelledby="theme-h">
          <h2 id="theme-h" className="text-lg font-bold">
            {t('website.chooseTheme')}
          </h2>
          <p className="mb-4 text-sm text-muted">{t('website.chooseThemeHint')}</p>
          <ThemeCards value={theme} onChange={setTheme} />
        </section>
        <section className="card p-5" aria-labelledby="colors-h">
          <h2 id="colors-h" className="text-lg font-bold">
            {t('website.colorsTitle')}
          </h2>
          <p className="mb-4 text-sm text-muted">{t('website.colorsHint')}</p>
          <ColorFields theme={theme} primary={colors.primary_color} accent={colors.accent_color} onChange={setColors} />
        </section>
        <section className="card p-5" aria-labelledby="sections-h">
          <h2 id="sections-h" className="text-lg font-bold">
            {t('website.sectionsTitle')}
          </h2>
          <p className="mb-4 text-sm text-muted">{t('website.sectionsHint')}</p>
          <SectionOrder value={sections} onChange={setSections} />
        </section>
        <div className="sticky bottom-20 z-10 flex items-center justify-end gap-3 rounded-card border border-line bg-surface/95 p-3 backdrop-blur md:bottom-4">
          {dirty && <span className="mr-auto text-sm font-semibold text-muted">{t('website.unsaved')}</span>}
          <button type="button" className="btn-primary" disabled={!dirty || !valid || save.isPending} onClick={submit}>
            {save.isPending ? <Spinner /> : t('common.save')}
          </button>
        </div>
      </div>
      <div className="xl:sticky xl:top-28 xl:self-start">
        <LivePreview slug={session.tenant.slug} state={{ theme, ...colors, sections }} />
      </div>
    </div>
  );
}

function ImagesTab() {
  const { t } = useTranslation();
  const { data } = useWebsite();
  if (!data) return null;
  return (
    <div className="card max-w-2xl space-y-6 p-5">
      <ImageUpload slot="logo" image={data.theme.logo} round />
      <hr className="border-line" />
      <ImageUpload slot="cover" image={data.theme.cover} />
      <p className="text-sm text-muted">{t('website.upload.realPhotos')}</p>
    </div>
  );
}

function ContentTab() {
  const { t } = useTranslation();
  const { data } = useWebsite();
  const save = useSaveContent();
  const [form, setForm] = useState<EditableContent | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setForm(data.content);
  }, [data]);
  if (!form) return null;

  const set = <K extends keyof EditableContent>(key: K, value: EditableContent[K]) => setForm({ ...form, [key]: value });
  const contact = (key: keyof EditableContent['contact'], value: string | boolean) => setForm({ ...form, contact: { ...form.contact, [key]: value === '' ? null : value } });
  const social = (key: keyof EditableContent['socials'], value: string) => setForm({ ...form, socials: { ...form.socials, [key]: value || null } });
  const text = (v: string) => (v === '' ? null : v);
  const legal = form.legal ?? { fssai: null, show_gstin: false };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (form.contact.whatsapp && !isIndianMobile(form.contact.whatsapp)) errs['contact.whatsapp'] = t('website.content.whatsappInvalid');
    if (legal.fssai && !/^\d{14}$/.test(legal.fssai)) errs['legal.fssai'] = t('website.content.fssaiInvalid');
    const urls: [string, string | null][] = [['contact.map_url', form.contact.map_url], ...Object.entries(form.socials).map(([k, v]) => [`socials.${k}`, v] as [string, string | null])];
    for (const [k, v] of urls) if (v && !/^https:\/\/\S+$/.test(v)) errs[k] = t('website.content.httpsOnly');
    form.milestones.forEach((m, i) => {
      if (!m.year.trim()) errs[`milestones.${i}.year`] = t('website.content.required');
      if (!m.title.trim()) errs[`milestones.${i}.title`] = t('website.content.required');
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate(form, {
      onSuccess: () => toast.success(t('website.saved')),
      onError: (err) => {
        if (err.errors) setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])));
        toast.error(err.message);
      },
    });
  };

  const bilingual = (key: 'tagline' | 'about', multiline = false, max = 140) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {(['', '_hi'] as const).map((suffix) => {
        const k = `${key}${suffix}` as 'tagline' | 'tagline_hi' | 'about' | 'about_hi';
        const value = form[k] ?? '';
        return (
          <Field key={k} label={t(`website.content.${key}`) + (suffix ? ' (हिन्दी)' : ' (English)')} optional hint={`${value.length}/${max}`} error={errors[k]}>
            {(a) =>
              multiline ? (
                <textarea {...a} rows={6} maxLength={max} lang={suffix ? 'hi' : 'en'} className="field-input" value={value} onChange={(e) => set(k, text(e.target.value))} />
              ) : (
                <input {...a} maxLength={max} lang={suffix ? 'hi' : 'en'} className="field-input" value={value} onChange={(e) => set(k, text(e.target.value))} />
              )
            }
          </Field>
        );
      })}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl space-y-6">
      <Alert tone="info">{t('website.content.truthful')}</Alert>
      <section className="card space-y-5 p-5" aria-labelledby="c-story">
        <h2 id="c-story" className="text-lg font-bold">
          {t('website.content.storyTitle')}
        </h2>
        {bilingual('tagline')}
        {bilingual('about', true, 3000)}
      </section>

      <section className="card space-y-4 p-5" aria-labelledby="c-ms">
        <h2 id="c-ms" className="text-lg font-bold">
          {t('website.content.milestones')}
        </h2>
        <p className="text-sm text-muted">{t('website.content.milestonesHint')}</p>
        {form.milestones.map((m, i) => (
          <fieldset key={i} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[110px_1fr_auto]">
            <legend className="sr-only">{t('website.content.milestoneN', { n: i + 1 })}</legend>
            <Field label={t('website.content.year')} error={errors[`milestones.${i}.year`]}>
              {(a) => <input {...a} maxLength={10} className="field-input" value={m.year} onChange={(e) => set('milestones', form.milestones.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)))} />}
            </Field>
            <Field label={t('website.content.milestoneTitle')} error={errors[`milestones.${i}.title`]}>
              {(a) => <input {...a} maxLength={80} className="field-input" value={m.title} onChange={(e) => set('milestones', form.milestones.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />}
            </Field>
            <button type="button" className="btn-ghost self-end !min-h-11 text-danger" onClick={() => set('milestones', form.milestones.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t('website.content.removeMilestone', { n: i + 1 })}</span>
            </button>
            <div className="sm:col-span-3">
              <Field label={t('website.content.milestoneText')} optional>
                {(a) => <input {...a} maxLength={300} className="field-input" value={m.text ?? ''} onChange={(e) => set('milestones', form.milestones.map((x, j) => (j === i ? { ...x, text: text(e.target.value) } : x)))} />}
              </Field>
            </div>
          </fieldset>
        ))}
        {form.milestones.length < 12 && (
          <button type="button" className="btn-outline !min-h-10 text-sm" onClick={() => set('milestones', [...form.milestones, { year: '', title: '', title_hi: null, text: null, text_hi: null }])}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t('website.content.addMilestone')}
          </button>
        )}
      </section>

      <section className="card space-y-5 p-5" aria-labelledby="c-contact">
        <h2 id="c-contact" className="text-lg font-bold">
          {t('website.content.contactTitle')}
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('website.content.phone')} optional error={errors['contact.phone']}>
            {(a) => <input {...a} type="tel" autoComplete="tel" className="field-input" value={form.contact.phone ?? ''} onChange={(e) => contact('phone', e.target.value)} />}
          </Field>
          <Field label={t('website.content.email')} optional error={errors['contact.email']}>
            {(a) => <input {...a} type="email" className="field-input" value={form.contact.email ?? ''} onChange={(e) => contact('email', e.target.value)} />}
          </Field>
          <div>
            <Field label="WhatsApp" optional error={errors['contact.whatsapp']}>
              {(a) => <input {...a} type="tel" inputMode="tel" className="field-input" value={form.contact.whatsapp ?? ''} onChange={(e) => contact('whatsapp', e.target.value)} />}
            </Field>
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.contact.whatsapp_verified} disabled={!form.contact.whatsapp} onChange={(e) => contact('whatsapp_verified', e.target.checked)} />
              {t('website.content.whatsappConfirm')}
            </label>
          </div>
          <Field label={t('website.content.mapUrl')} optional hint={t('website.content.mapHint')} error={errors['contact.map_url']}>
            {(a) => <input {...a} type="url" className="field-input" value={form.contact.map_url ?? ''} onChange={(e) => contact('map_url', e.target.value)} />}
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('website.content.address')} optional error={errors['contact.address']}>
              {(a) => <textarea {...a} rows={2} maxLength={300} className="field-input" value={form.contact.address ?? ''} onChange={(e) => contact('address', e.target.value)} />}
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={t('website.content.parking')} optional hint={t('website.content.parkingHint')} error={errors['contact.parking']}>
              {(a) => <input {...a} maxLength={160} className="field-input" value={form.contact.parking ?? ''} onChange={(e) => contact('parking', e.target.value)} />}
            </Field>
          </div>
        </div>
      </section>

      <section className="card space-y-5 p-5" aria-labelledby="c-social">
        <h2 id="c-social" className="text-lg font-bold">
          {t('website.content.socialTitle')}
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {(['instagram', 'facebook', 'youtube', 'google_maps'] as const).map((k) => (
            <Field key={k} label={t(`website.content.social.${k}`)} optional error={errors[`socials.${k}`]}>
              {(a) => <input {...a} type="url" placeholder="https://" className="field-input" value={form.socials[k] ?? ''} onChange={(e) => social(k, e.target.value)} />}
            </Field>
          ))}
        </div>
      </section>

      <section className="card space-y-5 p-5" aria-labelledby="c-legal">
        <h2 id="c-legal" className="text-lg font-bold">
          {t('website.content.legalTitle')}
        </h2>
        <p className="text-sm text-muted">{t('website.content.legalHint')}</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('website.content.fssai')} optional hint={t('website.content.fssaiHint')} error={errors['legal.fssai']}>
            {(a) => <input {...a} inputMode="numeric" maxLength={14} className="field-input tabular-nums" value={legal.fssai ?? ''} onChange={(e) => set('legal', { ...legal, fssai: text(e.target.value.replace(/\D/g, '')) })} />}
          </Field>
          <label className="flex items-start gap-3 self-center text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={legal.show_gstin} onChange={(e) => set('legal', { ...legal, show_gstin: e.target.checked })} />
            <span>
              <span className="block font-semibold">{t('website.content.showGstin')}</span>
              <span className="text-muted">{t('website.content.showGstinHint')}</span>
            </span>
          </label>
        </div>
      </section>

      <section className="card space-y-5 p-5" aria-labelledby="c-seo">
        <h2 id="c-seo" className="text-lg font-bold">
          {t('website.content.seoTitle')}
        </h2>
        <p className="text-sm text-muted">{t('website.content.seoHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['description', 'description_hi'] as const).map((k) => (
            <Field key={k} label={t('website.content.seoDescription') + (k.endsWith('_hi') ? ' (हिन्दी)' : ' (English)')} optional hint={`${(form.seo[k] ?? '').length}/160`} error={errors[`seo.${k}`]}>
              {(a) => <textarea {...a} rows={3} maxLength={160} className="field-input" value={form.seo[k] ?? ''} onChange={(e) => set('seo', { ...form.seo, [k]: text(e.target.value) })} />}
            </Field>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : t('common.save')}
        </button>
      </div>
    </form>
  );
}

export default function WebsitePage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const query = useWebsite();
  const [tab, setTab] = useState<Tab>('design');
  if (query.isError) return <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />;
  if (!query.data || !session?.tenant) return <SkeletonRows rows={6} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t('website.title')}</h1>
          <p className="text-muted">{t('website.subtitle')}</p>
        </div>
        <a href={tenantSiteUrl(session.tenant.slug)} target="_blank" rel="noopener noreferrer" className="btn-outline">
          {t('dashboard.openSite')} <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
      <div role="tablist" aria-label={t('website.title')} className="flex gap-1 overflow-x-auto border-b border-line">
        {(['design', 'images', 'content'] as Tab[]).map((k) => (
          <button key={k} type="button" role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} onClick={() => setTab(k)} className={`relative min-h-11 whitespace-nowrap px-4 text-sm font-semibold ${tab === k ? 'text-ink' : 'text-muted hover:text-ink'}`}>
            {t(`website.tabs.${k}`)}
            {tab === k && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'design' && <DesignTab />}
        {tab === 'images' && <ImagesTab />}
        {tab === 'content' && <ContentTab />}
      </div>
    </div>
  );
}
