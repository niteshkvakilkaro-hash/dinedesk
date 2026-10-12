import { useTranslation } from 'react-i18next';
import { CtaBand, Faq, Heading, Plans } from './parts';
import { marketingHead, usePageMeta } from './seo';

/** /pricing: the plans (prices set by the platform admin) and the common questions. */
export default function PricingPage() {
  const { t } = useTranslation();
  const faq = t('mk.faq.items', { returnObjects: true }) as { q: string; a: string }[];
  usePageMeta(marketingHead('/pricing', t));
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-brand">{t('mk.nav.pricing')}</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">{t('mk.pricing.title')}</h1>
          <p className="mt-4 text-lg text-muted">{t('mk.pricing.lead')}</p>
        </div>
        <div className="mt-10">
          <Plans />
        </div>
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
