import { Link, Navigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, ChevronRight } from 'lucide-react';
import { featureBySlug, FEATURE_PAGES } from './content';
import { CtaBand, Faq, Heading, PageStage, useTrialNote } from './parts';
import { marketingHead, usePageMeta } from './seo';

/** /features/<slug>: one page per product area, written for the searches owners make. */
export default function FeaturePage() {
  const { slug } = useParams();
  const feature = featureBySlug(slug);
  if (!feature) return <Navigate to="/" replace />;
  return <Feature key={feature.key} featureKey={feature.key} slug={feature.slug} />;
}

function Feature({ featureKey, slug }: { featureKey: string; slug: string }) {
  const { t } = useTranslation();
  const trial = useTrialNote();
  const k = `mk.f.${featureKey}`;
  const points = t(`${k}.points`, { returnObjects: true }) as { title: string; text: string }[];
  const faq = t(`${k}.faq`, { returnObjects: true }) as { q: string; a: string }[];
  const Icon = FEATURE_PAGES.find((f) => f.key === featureKey)!.icon;
  usePageMeta(marketingHead(`/features/${slug}`, t));

  return (
    <>
      <PageStage>
        <div className="mx-auto max-w-4xl px-5 pb-14 pt-10 text-center sm:px-8 sm:pb-16 sm:pt-14">
          <nav aria-label="Breadcrumb" className="flex items-center justify-center gap-1 text-sm text-white/65">
            <Link to="/#features" className="hover:text-white">
              {t('mk.feature.backHome')}
            </Link>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            <span aria-current="page" className="text-white/85">{t(`${k}.eyebrow`)}</span>
          </nav>
          <span className="mk-glass mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-2xl text-gold">
            <Icon className="h-8 w-8" aria-hidden="true" />
          </span>
          <p className="mt-5 text-sm font-bold uppercase tracking-wider text-[#ffb36b]">{t(`${k}.eyebrow`)}</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-[1.06] tracking-tight sm:text-6xl">{t(`${k}.title`)}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-white/72">{t(`${k}.lead`)}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link to="/signup" className="btn-brand mk-glow mk-shine group !px-7 text-base">
              {t('mk.hero.primary')}
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
            <Link to="/demo" className="mk-glass inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-base font-bold text-white transition-colors hover:bg-white/12">
              {t('mk.nav.demo')}
            </Link>
          </div>
          {trial && <p className="mt-4 text-sm text-white/60">{trial}</p>}
        </div>
      </PageStage>

      <section className="border-y border-line bg-surface py-16 sm:py-20" aria-labelledby="get-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Heading id="get-h" title={t('mk.feature.whatYouGet')} center />
          <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {points.map((p) => (
              <li key={p.title} className="rounded-3xl border border-line bg-paper p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
                  <Check className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-lg font-extrabold">{p.title}</h2>
                <p className="mt-1.5 text-muted">{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16 sm:py-20" aria-labelledby="faq-h">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Heading id="faq-h" title={t('mk.feature.faqTitle')} center />
          <div className="mt-8">
            <Faq items={faq} />
          </div>
        </div>
      </section>

      <section className="pb-16" aria-labelledby="rel-h">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 id="rel-h" className="text-2xl font-extrabold tracking-tight">
            {t('mk.feature.related')}
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURE_PAGES.filter((f) => f.key !== featureKey).map(({ slug: s, key, icon: RelIcon }) => (
              <Link key={s} to={`/features/${s}`} className="group rounded-2xl border border-line bg-surface p-5 transition-shadow hover:shadow-lg">
                <RelIcon className="h-6 w-6 text-brand" aria-hidden="true" />
                <h3 className="mt-3 font-extrabold">{t(`mk.f.${key}.eyebrow`)}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{t(`mk.modules.items.${key}.text`)}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
