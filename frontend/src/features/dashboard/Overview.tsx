import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowRight, ArrowUpRight, BedDouble, CalendarCheck, CalendarDays, Check, Clock, ExternalLink, IndianRupee, LineChart, Lock, Megaphone, Palette, ReceiptText, Store, Users, UtensilsCrossed } from 'lucide-react';
import { api } from '@/lib/api';
import { daysUntil, formatMoney as formatINR } from '@/lib/format';
import { tenantSiteUrl } from '@/lib/host';
import { useThemeColors } from '@/lib/adminTheme';
import { useCan, useFeature, useSession } from '@/hooks/useSession';
import { Badge, SkeletonRows } from '@/components/ui';

const SETUP = ['account', 'type', 'details', 'theme', 'branding', 'menu', 'live'] as const;
// Where each finished step can be revisited.
const EDIT: Partial<Record<(typeof SETUP)[number], string>> = { details: '/dashboard/business', theme: '/dashboard/website', branding: '/dashboard/website', menu: '/dashboard/menu' };

interface Stat {
  value: number | string;
  change: number | null;
}
interface DashboardData {
  from: string;
  to: string;
  hotel: boolean;
  stats?: {
    bookings: Stat & { rooms: number; tables: number };
    orders: Stat & { by_type: Record<string, number> };
    revenue: Stat & { restaurant: string; rooms: string };
    customers: Stat & { new: number; returning: number };
  };
  series?: { date: string; restaurant: string; rooms: string }[];
  distribution?: { rooms: number; tables: number; orders: number };
  top_dishes?: { id: number; name: string; quantity: number; sales: string; image: string | null }[];
  recent_orders?: { id: number; number: number; customer: string; items: number; total: string; status: string; at: string }[];
  recent_bookings?: { kind: 'room' | 'table'; code: string; name: string; when: string; party: number; status: string; amount: string | null; room_type?: string | null; at: string }[];
  rooms?: { id: number; name: string; total: number; free: number; image: string | null }[];
  recent_customers?: { id: number; name: string; orders: number; last: string }[];
}

/**
 * Dashboard home: the last 7 days in numbers (vs the 7 before), recent bookings and orders,
 * rooms free tonight, best sellers and quick actions. Everything comes from the business's
 * own records (GET /tenant/dashboard); each block appears only for roles that may see it.
 */
export default function Overview() {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  const { data: session } = useSession();
  const canTheme = useCan('theme.manage');
  const dash = useQuery({ queryKey: ['dashboard-home'], queryFn: async () => (await api.get<DashboardData>('/tenant/dashboard')).data, refetchInterval: 60_000 });
  if (!session?.tenant) return null;
  const tenant = session.tenant;
  const d = dash.data;
  const trialDays = tenant.subscription?.status === 'trialing' ? daysUntil(tenant.subscription.trial_ends_at) : null;
  const locale = i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN';
  const now = new Date();
  const enter = (i: number) => (reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] as const } });

  return (
    <div className="space-y-6">
      <motion.div {...enter(0)} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t('dashboard.home.title')}</h1>
          <p className="mt-1 text-muted">{t('dashboard.home.welcome', { name: session.user.name.split(' ')[0], business: tenant.name })}</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5">
          <CalendarDays className="h-5 w-5 text-brand" aria-hidden="true" />
          <div className="leading-tight">
            <p className="font-bold">{new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(now)}</p>
            <p className="text-xs text-muted">{new Intl.DateTimeFormat(locale, { weekday: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(now)}</p>
          </div>
        </div>
      </motion.div>

      {trialDays !== null && (
        <motion.div {...enter(1)} className="flex items-center gap-3 rounded-card bg-ink px-5 py-4 text-paper dark:border dark:border-line dark:bg-surface dark:text-ink">
          <Clock className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
          <p className="font-semibold">{t('dashboard.trialLeft', { count: trialDays, plan: tenant.plan.name })}</p>
        </motion.div>
      )}

      {tenant.status === 'onboarding' && <SetupChecklist step={tenant.onboarding_step} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {dash.isLoading && <SkeletonRows rows={6} />}
          {d?.stats && <StatCards d={d} />}
          {d?.series && d.distribution && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <RevenueChart series={d.series} hotel={d.hotel} />
              <Distribution dist={d.distribution} hotel={d.hotel} />
            </div>
          )}
          {(d?.recent_bookings || d?.recent_orders) && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {d.recent_bookings && <RecentBookings rows={d.recent_bookings} />}
              {d.recent_orders && <RecentOrders rows={d.recent_orders} />}
            </div>
          )}
          {(!!d?.rooms?.length || d?.top_dishes) && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {!!d.rooms?.length && <Rooms rooms={d.rooms} />}
              {d.top_dishes && <TopDishes rows={d.top_dishes} />}
            </div>
          )}
          <PlanCard />
        </div>

        <aside className="space-y-6">
          <section className="relative overflow-hidden rounded-card bg-side p-5 text-side-ink" aria-labelledby="site-title">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-side-active/25 blur-2xl" aria-hidden="true" />
            <h2 id="site-title" className="relative text-xl font-extrabold">
              {tenant.name}
            </h2>
            <p className="relative mt-1 text-sm text-side-muted">
              {t(`types.${tenant.business_type}`)} · {tenant.city}
            </p>
            <p className="relative mt-3 break-all font-mono text-xs text-side-muted">{tenant.site_host}</p>
            {tenant.status === 'live' && (
              <p className="relative mt-1 flex items-center gap-2 text-sm font-semibold">
                <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" /> {t('dashboard.siteLive')}
              </p>
            )}
            <div className="relative mt-4 flex flex-wrap gap-2">
              <a href={tenantSiteUrl(tenant.slug)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-side-active px-4 text-sm font-bold text-side-active-ink">
                {t('dashboard.openSite')} <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              {canTheme && (
                <Link to="/dashboard/website" className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-side-ink hover:bg-side-hover">
                  <Palette className="h-4 w-4" aria-hidden="true" /> {t('dashboard.customiseSite')}
                </Link>
              )}
            </div>
          </section>
          <QuickActions />
          {d && <Activity d={d} />}
          {d?.recent_customers && <RecentCustomers rows={d.recent_customers} />}
        </aside>
      </div>
    </div>
  );
}

function Card({ title, link, children, className = '' }: { title: string; link?: { to: string; label: string }; children: ReactNode; className?: string }) {
  const id = `h-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className={`card min-w-0 p-5 ${className}`} aria-labelledby={id}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={id} className="text-lg font-bold">
          {title}
        </h2>
        {link && (
          <Link to={link.to} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-strong hover:underline">
            {link.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-paper px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

function Change({ value }: { value: number | null }) {
  const { t } = useTranslation();
  if (value === null) return <span className="text-xs text-muted">{t('dashboard.home.noCompare')}</span>;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-bold ${up ? 'text-success' : 'text-danger'}`}>
      {up ? <ArrowUpRight className="h-4 w-4" aria-hidden="true" /> : <ArrowDownRight className="h-4 w-4" aria-hidden="true" />}
      {Math.abs(value)}%<span className="sr-only"> {t(up ? 'dashboard.home.up' : 'dashboard.home.down')}</span>
    </span>
  );
}

function StatCards({ d }: { d: DashboardData }) {
  const { t } = useTranslation();
  const s = d.stats!;
  const cards = [
    { key: 'bookings', icon: CalendarCheck, tint: 'var(--dd-success)', value: String(s.bookings.value), change: s.bookings.change, foot: d.hotel ? t('dashboard.home.bookingsFoot', { rooms: s.bookings.rooms, tables: s.bookings.tables }) : t('dashboard.home.tablesFoot', { count: s.bookings.tables }) },
    { key: 'orders', icon: UtensilsCrossed, tint: 'var(--dd-brand)', value: String(s.orders.value), change: s.orders.change, foot: Object.entries(s.orders.by_type).map(([k, n]) => `${t(`order.type.${k}`)}: ${n}`).join(' · ') || t('dashboard.home.noOrders') },
    { key: 'revenue', icon: IndianRupee, tint: 'var(--dd-sky)', value: formatINR(s.revenue.value), change: s.revenue.change, foot: d.hotel ? t('dashboard.home.revenueFoot', { rooms: formatINR(s.revenue.rooms), food: formatINR(s.revenue.restaurant) }) : t('dashboard.home.revenueFootFood') },
    { key: 'customers', icon: Users, tint: 'var(--dd-violet)', value: String(s.customers.value), change: s.customers.change, foot: t('dashboard.home.customersFoot', { new: s.customers.new, returning: s.customers.returning }) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 wide:grid-cols-4">
      {cards.map(({ key, icon: Icon, tint, value, change, foot }) => (
        <section key={key} className="rounded-card border border-line bg-[color-mix(in_srgb,var(--tint)_8%,var(--dd-surface))] p-4" style={{ ['--tint' as string]: tint }} aria-labelledby={`stat-${key}`}>
          <div className="flex items-center justify-between gap-3">
            <h2 id={`stat-${key}`} className="text-sm font-semibold text-muted">
              {t(`dashboard.home.stat.${key}`)}
            </h2>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--tint)_18%,var(--dd-surface))] text-[var(--tint)]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-1 break-words text-xl font-extrabold leading-tight tabular-nums sm:text-[1.65rem]">{value}</p>
          <Change value={change} />
          <p className="mt-3 border-t border-line pt-3 text-xs text-muted">{foot}</p>
        </section>
      ))}
      <p className="col-span-2 text-xs text-muted wide:col-span-4">{t('dashboard.home.period')}</p>
    </div>
  );
}

function RevenueChart({ series, hotel }: { series: NonNullable<DashboardData['series']>; hotel: boolean }) {
  const { t, i18n } = useTranslation();
  const c = useThemeColors(['brand', 'success', 'line', 'muted', 'surface', 'ink']);
  const data = series.map((p) => ({ label: new Intl.DateTimeFormat(i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' }).format(new Date(`${p.date}T00:00:00`)), restaurant: Number(p.restaurant), rooms: Number(p.rooms) }));
  const empty = data.every((p) => !p.restaurant && !p.rooms);
  const short = (v: number) => (v >= 1000 ? `₹${Math.round(v / 100) / 10}k` : `₹${v}`);
  return (
    <Card title={t('dashboard.home.revenueTitle')} className="lg:col-span-3" link={{ to: '/dashboard/reports', label: t('dashboard.home.reports') }}>
      <div className="mb-2 flex flex-wrap gap-4 text-xs font-semibold" aria-hidden="true">
        {hotel && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.success }} /> {t('dashboard.home.rooms')}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.brand }} /> {t('dashboard.home.restaurant')}
        </span>
      </div>
      {empty ? (
        <Empty>{t('dashboard.home.noRevenue')}</Empty>
      ) : (
        <div className="h-56" role="img" aria-label={t('dashboard.home.revenueTitle')}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="g-food" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.brand} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={c.brand} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g-rooms" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.success} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={c.success} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={c.line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={short} tick={{ fill: c.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 12, color: c.ink }} />
              {hotel && <Area type="monotone" dataKey="rooms" name={t('dashboard.home.rooms')} stroke={c.success} strokeWidth={2.5} fill="url(#g-rooms)" dot={{ r: 3 }} isAnimationActive={false} />}
              <Area type="monotone" dataKey="restaurant" name={t('dashboard.home.restaurant')} stroke={c.brand} strokeWidth={2.5} fill="url(#g-food)" dot={{ r: 3 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function Distribution({ dist, hotel }: { dist: NonNullable<DashboardData['distribution']>; hotel: boolean }) {
  const { t } = useTranslation();
  const c = useThemeColors(['success', 'brand', 'violet', 'line']);
  const parts = [...(hotel ? [{ key: 'rooms', value: dist.rooms, color: c.success }] : []), { key: 'tables', value: dist.tables, color: c.brand }, { key: 'orders', value: dist.orders, color: c.violet }];
  const total = parts.reduce((n, p) => n + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <Card title={t('dashboard.home.distTitle')} className="lg:col-span-2">
      {total === 0 ? (
        <Empty>{t('dashboard.home.noActivity')}</Empty>
      ) : (
        <div className="flex flex-col items-center gap-5">
          <div className="relative h-40 w-40 shrink-0" role="img" aria-label={t('dashboard.home.distTitle')}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={shown} dataKey="value" innerRadius="68%" outerRadius="100%" paddingAngle={shown.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                  {shown.map((p) => (
                    <Cell key={p.key} fill={p.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold tabular-nums">{total}</span>
              <span className="text-xs text-muted">{t('dashboard.home.total')}</span>
            </div>
          </div>
          <ul className="w-full space-y-3">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm font-semibold">{t(`dashboard.home.dist.${p.key}`)}</span>
                <span className="shrink-0 text-sm tabular-nums text-muted">
                  {p.value} ({Math.round((p.value / total) * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function RecentBookings({ rows }: { rows: NonNullable<DashboardData['recent_bookings']> }) {
  const { t } = useTranslation();
  const hasHotel = useFeature('hotel');
  return (
    <Card title={t('dashboard.home.recentBookings')} link={{ to: hasHotel ? '/dashboard/hotel' : '/dashboard/reservations', label: t('dashboard.home.viewAll') }}>
      {rows.length === 0 ? (
        <Empty>{t('dashboard.home.noBookings')}</Empty>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-2 font-semibold">{t('dashboard.home.col.guest')}</th>
                <th className="py-2 font-semibold">{t('dashboard.home.col.type')}</th>
                <th className="py-2 font-semibold">{t('dashboard.home.col.when')}</th>
                <th className="px-5 py-2 text-right font-semibold">{t('dashboard.home.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.code}`} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5">
                    <span className="block font-semibold">{r.name}</span>
                    <span className="text-xs text-muted">#{r.code}</span>
                  </td>
                  <td className="py-2.5">{r.kind === 'room' ? r.room_type ?? t('dashboard.home.room') : t('dashboard.home.table', { count: r.party })}</td>
                  <td className="py-2.5 tabular-nums text-muted">{r.kind === 'room' ? r.when.replace(' ', ' → ') : r.when}</td>
                  <td className="px-5 py-2.5 text-right">
                    <Badge tone={r.status}>{t(`dashboard.home.status.${r.status}`, { defaultValue: r.status })}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RecentOrders({ rows }: { rows: NonNullable<DashboardData['recent_orders']> }) {
  const { t } = useTranslation();
  return (
    <Card title={t('dashboard.home.recentOrders')} link={{ to: '/dashboard/orders', label: t('dashboard.home.viewAll') }}>
      {rows.length === 0 ? (
        <Empty>{t('dashboard.home.noOrders')}</Empty>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-2 font-semibold">{t('dashboard.home.col.order')}</th>
                <th className="py-2 font-semibold">{t('dashboard.home.col.customer')}</th>
                <th className="py-2 text-right font-semibold">{t('dashboard.home.col.total')}</th>
                <th className="px-5 py-2 text-right font-semibold">{t('dashboard.home.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-semibold tabular-nums">#{o.number}</td>
                  <td className="py-2.5">
                    <span className="block">{o.customer}</span>
                    <span className="text-xs text-muted">{t('dashboard.home.items', { count: o.items })}</span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{formatINR(o.total)}</td>
                  <td className="px-5 py-2.5 text-right">
                    <Badge tone={o.status}>{t(`order.status.${o.status}`)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Rooms({ rooms }: { rooms: NonNullable<DashboardData['rooms']> }) {
  const { t } = useTranslation();
  return (
    <Card title={t('dashboard.home.roomsTonight')} link={{ to: '/dashboard/hotel', label: t('dashboard.home.viewAll') }}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {rooms.map((r) => (
          <li key={r.id} className="overflow-hidden rounded-xl border border-line">
            {r.image ? (
              <img src={r.image} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
            ) : (
              <span className="flex aspect-[4/3] items-center justify-center bg-paper text-muted">
                <BedDouble className="h-6 w-6" aria-hidden="true" />
              </span>
            )}
            <div className="p-2.5">
              <p className="truncate text-sm font-semibold">{r.name}</p>
              <p className="text-xs text-muted">{t('dashboard.home.free', { free: r.free, total: r.total })}</p>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
                <span className="block h-full rounded-full bg-success" style={{ width: `${r.total ? (r.free / r.total) * 100 : 0}%` }} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TopDishes({ rows }: { rows: NonNullable<DashboardData['top_dishes']> }) {
  const { t } = useTranslation();
  return (
    <Card title={t('dashboard.home.topDishes')} link={{ to: '/dashboard/reports', label: t('dashboard.home.viewAll') }}>
      {rows.length === 0 ? (
        <Empty>{t('dashboard.home.noDishes')}</Empty>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              {r.image ? (
                <img src={r.image} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-paper text-muted">
                  <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{r.name}</span>
                <span className="text-xs text-muted">{t('dashboard.home.sold', { count: r.quantity })}</span>
              </span>
              <span className="text-sm font-semibold tabular-nums">{formatINR(r.sales)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentCustomers({ rows }: { rows: NonNullable<DashboardData['recent_customers']> }) {
  const { t, i18n } = useTranslation();
  return (
    <Card title={t('dashboard.home.recentCustomers')} link={{ to: '/dashboard/customers', label: t('dashboard.home.viewAll') }}>
      {rows.length === 0 ? (
        <Empty>{t('dashboard.home.noCustomers')}</Empty>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-strong" aria-hidden="true">
                {c.name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="text-xs text-muted">{t('dashboard.home.ordersCount', { count: c.orders })}</span>
              </span>
              <span className="text-xs text-muted">{new Intl.DateTimeFormat(i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(c.last))}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Shortcuts to the things owners do most, only those this role may do. */
function QuickActions() {
  const { t } = useTranslation();
  const hotel = useFeature('hotel');
  const items = [
    { show: useCan('pos.use'), to: '/dashboard/pos', icon: Store, label: t('dashboard.home.qa.pos') },
    { show: useCan('menu.manage'), to: '/dashboard/menu', icon: UtensilsCrossed, label: t('dashboard.home.qa.dish') },
    { show: useCan('rooms.setup') && hotel, to: '/dashboard/hotel', icon: BedDouble, label: t('dashboard.home.qa.room') },
    { show: useCan('reservations.manage'), to: '/dashboard/reservations', icon: CalendarCheck, label: t('dashboard.home.qa.booking') },
    { show: useCan('marketing.manage'), to: '/dashboard/marketing', icon: Megaphone, label: t('dashboard.home.qa.offer') },
    { show: useCan('reports.view'), to: '/dashboard/reports', icon: LineChart, label: t('dashboard.home.qa.reports') },
  ].filter((i) => i.show);
  if (!items.length) return null;
  return (
    <Card title={t('dashboard.home.quickActions')}>
      <ul className="grid grid-cols-2 gap-2">
        {items.map(({ to, icon: Icon, label }) => (
          <li key={to + label}>
            <Link to={to} className="flex min-h-16 items-center gap-2.5 rounded-xl border border-line bg-paper px-3 text-sm font-semibold hover:border-ink/30">
              <Icon className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Latest orders and bookings, newest first, from the lists above. */
function Activity({ d }: { d: DashboardData }) {
  const { t, i18n } = useTranslation();
  if (!d.recent_orders && !d.recent_bookings) return null;
  const rtf = new Intl.RelativeTimeFormat(i18n.language?.startsWith('hi') ? 'hi' : 'en', { numeric: 'auto' });
  const ago = (iso: string) => {
    const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
    return Math.abs(mins) < 60 ? rtf.format(mins, 'minute') : Math.abs(mins) < 1440 ? rtf.format(Math.round(mins / 60), 'hour') : rtf.format(Math.round(mins / 1440), 'day');
  };
  const items = [
    ...(d.recent_orders ?? []).map((o) => ({ at: o.at, icon: ReceiptText, title: t('dashboard.home.act.order', { number: o.number }), text: `${o.customer} · ${formatINR(o.total)}` })),
    ...(d.recent_bookings ?? []).map((b) => ({ at: b.at, icon: b.kind === 'room' ? BedDouble : CalendarCheck, title: t(b.kind === 'room' ? 'dashboard.home.act.room' : 'dashboard.home.act.table'), text: b.kind === 'room' ? `${b.name}${b.room_type ? ` · ${b.room_type}` : ''}` : `${b.name} · ${t('dashboard.home.table', { count: b.party })}` })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);
  return (
    <Card title={t('dashboard.home.activity')}>
      {items.length === 0 ? (
        <Empty>{t('dashboard.home.noActivity')}</Empty>
      ) : (
        <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-4 before:top-2 before:w-px before:bg-line">
          {items.map((i, n) => (
            <li key={n} className="relative flex gap-3">
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-side text-side-active">
                <i.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{i.title}</span>
                <span className="block truncate text-xs text-muted">{i.text}</span>
                <span className="text-xs text-muted">{ago(i.at)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function SetupChecklist({ step }: { step: number }) {
  const { t } = useTranslation();
  return (
    <section className="card p-5" aria-labelledby="setup-title">
      <h2 id="setup-title" className="text-lg font-bold">
        {t('dashboard.setupTitle')}
      </h2>
      <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SETUP.map((key, i) => {
          const done = i + 1 < step;
          const edit = EDIT[key];
          return (
            <li key={key} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-success text-white' : 'bg-paper text-muted'}`}>
                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
              </span>
              <span className={`flex-1 ${done ? 'text-muted line-through decoration-muted/40' : 'font-semibold'}`}>{t(`onboarding.steps.${key}`)}</span>
              {done && edit && (
                <Link to={edit} className="text-xs font-semibold text-brand-strong underline underline-offset-2">
                  {t('common.edit')}
                  <span className="sr-only"> {t(`onboarding.steps.${key}`)}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** What the plan includes (folded away; owners look at it rarely). */
function PlanCard() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const tenant = session?.tenant;
  if (!session || !tenant) return null;
  return (
    <details className="card p-5">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span className="text-lg font-bold">
          {t('dashboard.planTitle')}: {tenant.plan.name}
        </span>
        {tenant.subscription && <Badge tone={tenant.subscription.status}>{t(`statuses.${tenant.subscription.status}`)}</Badge>}
      </summary>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(session.features).map(([key, enabled]) => (
          <li key={key} className={`flex items-center gap-2 text-sm ${enabled ? '' : 'text-muted'}`}>
            {enabled ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
            {t(`features.${key}`)}
            {!enabled && <span className="sr-only">({t('dashboard.notIncluded')})</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
