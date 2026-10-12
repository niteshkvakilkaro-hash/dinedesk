import { useTranslation } from 'react-i18next';
import { CtaBand, ThemeGrid } from './parts';
import { breadcrumbJsonLd, orgJsonLd, usePageMeta } from './seo';

/** /themes: every website theme with a link to its live demo site. */
export default function ThemesPage() {
  const { t } = useTranslation();
  usePageMeta({
    title: t('mk.seo.themesTitle'),
    description: t('mk.seo.themesDesc'),
    path: '/themes',
    jsonLd: [orgJsonLd()[0], breadcrumbJsonLd([{ name: 'DineDesk', path: '/' }, { name: t('mk.nav.themes'), path: '/themes' }])],
  });
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-wider text-brand">{t('mk.nav.themes')}</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">{t('mk.themes.title')}</h1>
          <p className="mt-4 text-lg text-muted">{t('mk.themes.lead')}</p>
        </div>
        <div className="mt-10">
          <ThemeGrid />
        </div>
        <p className="mt-4 text-sm text-muted">{t('mk.themes.demoNote')}</p>
      </section>
      <CtaBand />
    </>
  );
}
