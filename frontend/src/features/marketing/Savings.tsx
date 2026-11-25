import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { animate, useReducedMotion } from 'motion/react';
import { ArrowRight, TrendingDown } from 'lucide-react';
import { formatINR } from '@/lib/format';
import { usePlans } from './parts';

const PRERENDERED = typeof document !== 'undefined' && !!document.getElementById('prerender');

/** Whole rupees, no paise: ₹1,25,000. */
const rupees = (v: number) => formatINR(Math.round(v));

/** Monthly commission paid to delivery apps, the same over a year, and what is left after the NikoBite plan. */
export function savings(orders: number, avg: number, pct: number, planMonthly: number | null) {
  const monthly = (orders * avg * pct) / 100;
  const yearly = monthly * 12;
  const kept = planMonthly === null ? yearly : Math.max(0, yearly - planMonthly * 12);
  return { monthly, yearly, kept };
}

/** A rupee amount that glides to its new value when the sliders move (jumps with reduced motion). */
function Amount({ value, className = '' }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce || PRERENDERED || from.current === value) {
      from.current = value;
      setShown(value);
      return undefined;
    }
    const controls = animate(from.current, value, { duration: 0.6, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { from.current = v; setShown(v); } });
    return () => controls.stop();
  }, [value, reduce]);
  return <span className={`tabular-nums ${className}`}>{rupees(shown)}</span>;
}

function Slider({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void }) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-semibold">{label}</label>
        <output htmlFor={id} className="text-lg font-extrabold tabular-nums text-brand-strong">{display}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mk-range mt-3 w-full"
        style={{ ['--fill' as string]: `${fill}%` }}
      />
    </div>
  );
}

/** "How much do delivery apps take?" — sliders for orders, order value and commission, against the NikoBite plan. */
export function SavingsCalculator() {
  const { t } = useTranslation();
  const plans = usePlans();
  const [orders, setOrders] = useState(600);
  const [avg, setAvg] = useState(400);
  const [pct, setPct] = useState(25);

  const data = plans.data;
  const featured = data?.plans.find((p) => p.code === data.trial.plan && p.price_monthly !== null) ?? data?.plans.find((p) => p.price_monthly !== null);
  const planMonthly = featured?.price_monthly != null ? Number(featured.price_monthly) : null;
  const r = savings(orders, avg, pct, planMonthly);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col justify-center gap-7 rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <Slider label={t('mk.savings.orders')} value={orders} min={50} max={3000} step={50} display={orders.toLocaleString('en-IN')} onChange={setOrders} />
        <Slider label={t('mk.savings.avg')} value={avg} min={100} max={2000} step={50} display={rupees(avg)} onChange={setAvg} />
        <Slider label={t('mk.savings.pct')} value={pct} min={5} max={35} step={1} display={`${pct}%`} onChange={setPct} />
        <p className="text-sm text-muted">{t('mk.savings.note')}</p>
      </div>

      <div className="mk-stage relative overflow-hidden rounded-3xl p-6 text-white sm:p-8" aria-live="polite">
        <div className="mk-aurora -right-24 -top-24 h-72 w-72 bg-[#c2410c]" aria-hidden="true" />
        <div className="mk-grain" aria-hidden="true" />
        <div className="relative">
          <p className="flex items-center gap-2 text-sm font-semibold text-white/70">
            <TrendingDown className="h-4 w-4" aria-hidden="true" />
            {t('mk.savings.monthly')}
          </p>
          <p className="mt-1 text-3xl font-extrabold sm:text-4xl">
            <Amount value={r.monthly} />
          </p>
          <dl className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/8 p-4">
              <dt className="text-sm text-white/70">{t('mk.savings.yearly')}</dt>
              <dd className="mt-1 text-xl font-extrabold text-[#fca5a5]"><Amount value={r.yearly} /></dd>
            </div>
            <div className="rounded-2xl bg-white/8 p-4">
              <dt className="text-sm text-white/70">{featured ? t('mk.savings.plan', { plan: featured.name }) : t('mk.savings.planNone')}</dt>
              <dd className="mt-1 text-xl font-extrabold">{planMonthly !== null ? t('mk.savings.perMonth', { amount: rupees(planMonthly) }) : '—'}</dd>
            </div>
          </dl>
          <div className="mt-6 border-t border-white/15 pt-6">
            <p className="text-sm font-semibold text-white/70">{t('mk.savings.kept')}</p>
            <p className="mt-1 bg-gradient-to-r from-[#f2b544] to-[#fb923c] bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
              <Amount value={r.kept} />
            </p>
            <p className="mt-2 text-sm text-white/70">{t('mk.savings.zero')}</p>
          </div>
          <Link to="/signup" className="btn-brand mk-shine group mt-7 !px-7">
            {t('mk.savings.cta')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
