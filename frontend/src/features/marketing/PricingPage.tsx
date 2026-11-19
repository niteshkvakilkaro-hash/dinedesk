import { useTranslation } from 'react-i18next';
import { CtaBand, Faq, Heading, PageStage, Plans } from './parts';
import { marketingHead, usePageMeta } from './seo';

/** /pricing: the plans (prices set by the platform admin) and the common questions. */
export default function PricingPage() {
  const { t } = useTranslation();
  const faq = t('mk.faq.items', { returnObjects: true }) as { q: string; a: string }[];
  usePageMeta(marketingHead('/pricing', t));
  return (
    <>
      <PageStage>
        <div className="mx-auto max-w-2xl px-5 pb-14 pt-12 text-center sm:pb-16 sm:pt-16">
          <p className="text-sm font-bold uppercase tracking-wider text-[#ffb36b]">{t('mk.nav.pricing')}</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-6xl">{t('mk.pricing.title')}</h1>
          <p className="mt-4 text-lg text-white/72">{t('mk.pricing.lead')}</p>
        </div>
      </PageStage>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6">
        <Plans />
      </section>
      <section className="pb-20" aria-labelledby="faq-h">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Heading id="faq-h" title={t('mk.faq.title')} center />
          <div className="mt-8">
            <Faq items={faq} />
          </div>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
