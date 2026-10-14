import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, Sparkles } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { LANGUAGES } from '@/i18n';
import { isRtl, languageCode } from '@/i18n/locale';
import { Alert, Badge, EmptyState, ErrorState, SkeletonRows, Spinner, toast } from '@/components/ui';
import { useAiStatus } from './AiImport';

type Group = 'menu' | 'rooms' | 'banners' | 'website';

interface Entry {
  key: string;
  group: Group;
  type: string;
  field: string;
  /** Where it belongs (the section of a dish, the dish of a size …). */
  label: string | null;
  source: string;
  hi: string | null;
  value: string;
  max: number;
}

interface Payload { lang: string; entries: Entry[] }

/** Hindi has its own fields in the normal editors; English is the source. */
const EDITABLE = LANGUAGES.filter((l) => l.code !== 'en' && l.code !== 'hi');
const GROUPS: Group[] = ['menu', 'rooms', 'banners', 'website'];
/** The server takes at most this many texts per AI request. */
const AI_CHUNK = 120;
const TOP = new Set(['category.name', 'item.name', 'group.name', 'room.name', 'banner.title', 'site.tagline', 'site.about', 'milestone.title', 'seo.description']);
const LONG = new Set(['item.description', 'room.description', 'banner.text', 'site.about', 'milestone.text', 'seo.description']);

function useTranslations(lang: string) {
  return useQuery({ queryKey: ['translations', lang], queryFn: async () => (await api.get<Payload>('/tenant/translations', { lang })).data });
}

/**
 * Dashboard → Menu → Languages: the owner's menu, rooms, offers and website text in the site's other
 * languages. The AI fills empty rows as drafts; nothing is saved until the owner presses Save.
 */
export default function LanguagesPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const fromUi = languageCode(i18n.language);
  const lang = EDITABLE.find((l) => l.code === params.get('lang'))?.code ?? EDITABLE.find((l) => l.code === fromUi)?.code ?? EDITABLE[0].code;
  const query = useTranslations(lang);
  const [dirty, setDirty] = useState(0);

  const pick = (code: string) => {
    if (dirty && !window.confirm(t('menuAdmin.languages.switchConfirm'))) return;
    setParams({ lang: code }, { replace: true });
  };

  return (
    <div className="space-y-5">
      <div>
        <Link to="/dashboard/menu" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /> {t('menuAdmin.languages.back')}
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">{t('menuAdmin.languages.title')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('menuAdmin.languages.intro')}</p>
      </div>

      <label className="block max-w-xs">
        <span className="field-label">{t('menuAdmin.languages.language')}</span>
        <select className="field-input" value={lang} onChange={(e) => pick(e.target.value)}>
          {EDITABLE.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </label>

      {query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
      ) : !query.data || query.data.lang !== lang ? (
        <SkeletonRows rows={8} />
      ) : (
        // A fresh editor per language, so drafts never carry over to another language.
        <Editor key={lang} lang={lang} entries={query.data.entries} onDirty={setDirty} />
      )}
    </div>
  );
}

function Editor({ lang, entries, onDirty }: { lang: string; entries: Entry[]; onDirty: (n: number) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const ai = useAiStatus();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Rows the AI filled and nobody has touched since.
  const [aiRows, setAiRows] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const rtl = isRtl(lang);

  const value = (e: Entry) => drafts[e.key] ?? e.value;
  const changed = useMemo(() => entries.filter((e) => drafts[e.key] !== undefined && drafts[e.key].trim() !== e.value), [entries, drafts]);
  const done = entries.filter((e) => value(e).trim() !== '').length;
  const empty = entries.filter((e) => value(e).trim() === '');

  useEffect(() => onDirty(changed.length), [changed.length, onDirty]);
  // Closing the tab with unsaved work asks first.
  useEffect(() => {
    if (!changed.length) return;
    const warn = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changed.length]);

  const edit = (key: string, text: string) => {
    setDrafts((d) => ({ ...d, [key]: text }));
    setAiRows((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : s));
  };

  const fill = async () => {
    const keys = empty.map((e) => e.key);
    if (!keys.length) {
      toast.success(t('menuAdmin.languages.aiNothing'));
      return;
    }
    setProgress({ done: 0, total: keys.length });
    let filled = 0;
    try {
      for (let i = 0; i < keys.length; i += AI_CHUNK) {
        const chunk = keys.slice(i, i + AI_CHUNK);
        const { suggestions } = (await api.post<{ suggestions: Record<string, string> }>('/tenant/translations/ai', { lang, keys: chunk })).data;
        const got = Object.entries(suggestions);
        filled += got.length;
        // Never overwrite what the owner typed meanwhile.
        setDrafts((d) => ({ ...d, ...Object.fromEntries(got.filter(([k]) => !(d[k] ?? '').trim())) }));
        setAiRows((s) => new Set([...s, ...got.map(([k]) => k)]));
        setProgress({ done: Math.min(i + chunk.length, keys.length), total: keys.length });
      }
      toast.success(t('menuAdmin.languages.aiDone', { count: filled }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put<Payload>('/tenant/translations', { lang, values: Object.fromEntries(changed.map((e) => [e.key, drafts[e.key].trim()])) });
      qc.setQueryData(['translations', lang], res.data);
      void qc.invalidateQueries({ queryKey: ['site'] });
      setDrafts({});
      setAiRows(new Set());
      toast.success(t('menuAdmin.languages.saved'));
    } catch (e) {
      toast.error(e instanceof ApiError && e.errors ? Object.values(e.errors)[0]?.[0] ?? e.message : (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!entries.length) return <EmptyState title={t('menuAdmin.languages.emptyTitle')}>{t('menuAdmin.languages.emptyHint')}</EmptyState>;

  const actions = (
    <div className="flex flex-wrap gap-2">
      {ai.data?.enabled && (
        <button type="button" className="btn-outline" disabled={!!progress || saving} onClick={() => void fill()}>
          {progress ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />} {t('menuAdmin.languages.fillAi')}
        </button>
      )}
      <button type="button" className="btn-primary" disabled={!changed.length || saving || !!progress} onClick={() => void save()}>
        {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" aria-hidden="true" />} {t('menuAdmin.languages.save')}
      </button>
    </div>
  );

  return (
    <>
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <p className="font-semibold">{t('menuAdmin.languages.filled', { done, total: entries.length })}</p>
          {progress ? (
            <p className="text-muted" role="status">{t('menuAdmin.languages.filling', { done: progress.done, total: progress.total })}</p>
          ) : changed.length > 0 ? (
            <p className="font-semibold text-warn">{t('menuAdmin.languages.unsaved', { count: changed.length })}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {ai.data && !ai.data.enabled && <Alert tone="info">{t('menuAdmin.ai.off')}</Alert>}
      {aiRows.size > 0 && <Alert tone="warn">{t('menuAdmin.languages.aiCheck')}</Alert>}

      {GROUPS.map((g) => {
        const rows = entries.filter((e) => e.group === g);
        if (!rows.length) return null;
        return (
          <section key={g} className="card overflow-hidden" aria-labelledby={`lang-${g}`}>
            <h2 id={`lang-${g}`} className="border-b border-line bg-paper px-4 py-3 text-lg font-bold">{t(`menuAdmin.languages.group.${g}`)}</h2>
            <ul className="divide-y divide-line">
              {rows.map((e) => {
                const kind = `${e.type}.${e.field}`;
                const long = LONG.has(kind);
                const id = `tr-${e.key.replace(/:/g, '-')}`;
                const isAi = aiRows.has(e.key);
                const props = {
                  id,
                  value: value(e),
                  maxLength: e.max,
                  lang,
                  dir: rtl ? 'rtl' : 'ltr',
                  className: `field-input ${isAi ? '!border-warn' : ''}`,
                  'aria-describedby': `${id}-src`,
                  onChange: (ev: { target: { value: string } }) => edit(e.key, ev.target.value),
                } as const;
                return (
                  <li key={e.key} className="grid gap-2 px-4 py-3 md:grid-cols-2 md:gap-4">
                    {/* Descriptions, sizes and add-ons sit a little in, under the thing they belong to. */}
                    <div className={`min-w-0 ${TOP.has(kind) ? '' : 'md:ps-5'}`}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {t(`menuAdmin.languages.kind.${e.type}_${e.field}`)}{e.label ? <span className="normal-case tracking-normal"> · {e.label}</span> : null}
                      </p>
                      <p id={`${id}-src`} lang="en" className={`mt-0.5 break-words ${long ? 'whitespace-pre-line text-sm' : 'font-semibold'}`}>{e.source}</p>
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={id} className="sr-only">{t('menuAdmin.languages.inputLabel', { text: e.source.slice(0, 60) })}</label>
                      {long ? <textarea rows={kind === 'site.about' ? 6 : 3} {...props} /> : <input type="text" {...props} />}
                      {isAi && <p className="mt-1"><Badge tone="pending"><Sparkles className="me-1 h-3 w-3" aria-hidden="true" />{t('menuAdmin.languages.aiDraft')}</Badge></p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <div className="flex justify-end">{actions}</div>
    </>
  );
}
