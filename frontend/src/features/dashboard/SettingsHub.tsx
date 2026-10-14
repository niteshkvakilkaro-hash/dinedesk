import { useMemo } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, Settings } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { EmptyState } from '@/components/ui';
import { accessFrom, settingsSections } from './navigation';

/**
 * Settings: one page with a card for everything there is to set up (business details, ordering
 * and payments, team, plan…), plus the extras that live inside other pages (menu languages,
 * morning summary, printer, calendar sync…). Each card links to the page that already does it.
 */
export default function SettingsHub() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const sections = useMemo(() => settingsSections(accessFrom(session)), [session]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <Settings className="h-7 w-7" aria-hidden="true" /> {t('dashboard.settingsHub.title')}
        </h1>
        <p className="mt-1 text-muted">{t('dashboard.settingsHub.subtitle')}</p>
      </div>
      {!sections.length && <EmptyState title={t('dashboard.settingsHub.empty')} />}
      {sections.map((s) => (
        <section key={s.key} aria-labelledby={`settings-${s.key}`}>
          <h2 id={`settings-${s.key}`} className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            {t(`dashboard.settingsHub.sections.${s.key}`)}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {s.items.map(({ id, to, icon: Icon, title }) => (
              <li key={id}>
                <Link to={to} className="group flex h-full min-h-20 items-start gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:border-ink/30">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{t(title)}</span>
                    <span className="mt-0.5 block text-sm text-muted">{t(`dashboard.find.items.${id}.desc`)}</span>
                  </span>
                  <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!!sections.length && <p className="text-sm text-muted">{t('dashboard.settingsHub.searchTip')}</p>}
    </div>
  );
}

/** "← Settings" above every page that lives under Settings (they keep their own URLs). */
export function SettingsBackLink() {
  const { t } = useTranslation();
  return (
    <Link to="/dashboard/settings" className="-mt-2 mb-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /> {t('dashboard.settingsHub.back')}
    </Link>
  );
}
