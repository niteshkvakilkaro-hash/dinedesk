import { useTranslation } from 'react-i18next';
import { CtaBand, PageStage, ThemeGrid } from './parts';
import { marketingHead, usePageMeta } from './seo';

/** /themes: every website theme with a link to its live demo site. */
export default function ThemesPage() {
  const { t } = useTranslation();
  usePageMeta(marketingHead('/themes', t));
  return (
    <>
      <PageStage>
        <div className="mx-auto max-w-6xl px-5 pb-14 pt-12 sm:px-8 sm:pb-16 sm:pt-16">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-wider text-[#ffb36b]">{t('mk.nav.themes')}</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-6xl">{t('mk.themes.title')}</h1>
            <p className="mt-4 text-lg text-white/72">{t('mk.themes.lead')}</p>
          </div>
        </div>
      </PageStage>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6">
        <div>
          <ThemeGrid />
        </div>
        <p className="mt-4 text-sm text-muted">{t('mk.themes.demoNote')}</p>
      </section>
      <CtaBand />
    </>
  );
}
