import { describe, expect, it } from 'vitest';
import type { Session } from '@/types';
import { accessFrom, destinationsFor, isSettingsPath, navGroups, SETTINGS_PAGES, settingsSections } from './navigation';
import { homePath } from '@/lib/home';

const session = (permissions: string[], features: string[] = [], extra: Partial<Session> = {}) =>
  ({ permissions, features: Object.fromEntries(features.map((f) => [f, true])), branches: [], tenant: { is_branch: false }, ...extra }) as unknown as Session;

const ALL_FEATURES = ['reservations', 'qr_ordering', 'pos', 'kds', 'coupons', 'loyalty', 'inventory', 'hotel', 'multi_branch', 'website'];
const owner = session(
  ['orders.view', 'orders.manage', 'orders.create', 'reservations.manage', 'tables.manage', 'tables.setup', 'pos.use', 'kot.update', 'menu.manage', 'customers.view', 'marketing.manage', 'inventory.manage', 'reports.view', 'theme.manage', 'business.manage', 'staff.manage', 'staff.schedule', 'billing.manage', 'rooms.manage', 'rooms.setup', 'housekeeping.update'],
  ALL_FEATURES,
);
const ids = (groups: ReturnType<typeof navGroups>) => groups.flatMap((g) => g.items.map((i) => i.label));

describe('sidebar', () => {
  it('gives an owner the plain-language groups and a single Settings item', () => {
    const groups = navGroups(accessFrom(owner));
    expect(groups.map((g) => g.key)).toEqual(['today', 'menuRooms', 'customers', 'money', 'website', 'settings']);
    expect(groups.at(-1)!.items.map((i) => i.label)).toEqual(['settings']);
    // Settings pages are no longer in the sidebar themselves.
    for (const page of ['ordering', 'team', 'rota', 'business', 'branches', 'domains', 'billing']) expect(ids(groups)).not.toContain(page);
  });

  it('shows kitchen staff only their screen (one group, no Settings)', () => {
    const groups = navGroups(accessFrom(session(['kot.update'], ['kds'])));
    expect(groups.map((g) => g.key)).toEqual(['today']);
    expect(ids(groups)).toEqual(['overview', 'kitchen']);
  });

  it('hides features the plan does not include', () => {
    const noPlan = session(owner.permissions, []);
    const list = ids(navGroups(accessFrom(noPlan)));
    for (const page of ['reservations', 'tables', 'pos', 'kitchen', 'hotel', 'marketing', 'inventory']) expect(list).not.toContain(page);
    expect(list).toContain('settings');
  });

  it('lights up Settings on every settings page and the hub', () => {
    for (const p of SETTINGS_PAGES) expect(isSettingsPath(p)).toBe(true);
    expect(isSettingsPath('/dashboard/settings')).toBe(true);
    expect(isSettingsPath('/dashboard/menu')).toBe(false);
  });
});

describe('Settings page and search use the same gates', () => {
  it('shows a manager with only rota rights just the shifts card', () => {
    const a = accessFrom(session(['staff.schedule']));
    expect(navGroups(a).some((g) => g.key === 'settings')).toBe(true);
    expect(settingsSections(a)).toEqual([
      { key: 'account', items: [expect.objectContaining({ id: 'account' }), expect.objectContaining({ id: 'deviceAlerts' })] },
      { key: 'people', items: [expect.objectContaining({ id: 'rota' })] },
    ]);
  });

  it('gives an owner every settings card, and branches only with the plan or several outlets', () => {
    const all = settingsSections(accessFrom(owner)).flatMap((s) => s.items.map((i) => i.id));
    expect(all).toEqual(expect.arrayContaining(['business', 'ordering', 'payments', 'billing', 'domains', 'branches', 'referral', 'team', 'rota', 'tableQr', 'printers', 'menuLanguages', 'dailySummary', 'calendarSync']));
    const single = session(owner.permissions, ALL_FEATURES.filter((f) => f !== 'multi_branch'));
    expect(settingsSections(accessFrom(single)).flatMap((s) => s.items.map((i) => i.id))).not.toContain('branches');
  });

  it('keeps Refer a business off branches and people without billing rights', () => {
    const branch = session(owner.permissions, ALL_FEATURES, { tenant: { is_branch: true } as Session['tenant'] });
    expect(destinationsFor(accessFrom(branch)).map((d) => d.id)).not.toContain('referral');
    expect(destinationsFor(accessFrom(session(['business.manage']))).map((d) => d.id)).not.toContain('referral');
  });

  it('only indexes what this person may open', () => {
    const waiter = destinationsFor(accessFrom(session(['tables.manage', 'orders.create', 'orders.view'], ['qr_ordering']))).map((d) => d.id);
    expect(waiter).toEqual(expect.arrayContaining(['overview', 'orders', 'tables', 'waiter']));
    expect(waiter).not.toContain('reports');
    expect(waiter).not.toContain('settings');
    expect(waiter).not.toContain('tableQr');
  });

  it('gives everyone My account, in search and on the Settings page', () => {
    const kitchen = accessFrom(session(['kot.update'], ['kds']));
    expect(destinationsFor(kitchen).find((d) => d.id === 'account')?.to).toBe('/dashboard/account');
    expect(settingsSections(kitchen)[0]).toEqual({ key: 'account', items: [expect.objectContaining({ id: 'account' }), expect.objectContaining({ id: 'deviceAlerts' })] });
    // Push alerts on this device: a card on My account, for everyone (like the header Appearance menu).
    expect(destinationsFor(kitchen).find((d) => d.id === 'deviceAlerts')?.to).toBe('/dashboard/account?open=alerts');
    expect(isSettingsPath('/dashboard/account')).toBe(true);
  });

  it('sends kitchen staff to the kitchen screen for the printer', () => {
    const kitchen = destinationsFor(accessFrom(session(['kot.update'], ['kds'])));
    expect(kitchen.find((d) => d.id === 'printers')?.to).toBe('/kitchen');
  });
});

describe('delivery riders', () => {
  it('shows the Riders page to those who move orders on, when online ordering is in the plan', () => {
    const cashier = accessFrom(session(['orders.view', 'orders.manage', 'pos.use'], ['online_ordering', 'pos']));
    expect(ids(navGroups(cashier))).toContain('riders');
    expect(destinationsFor(cashier).find((d) => d.id === 'riders')?.to).toBe('/dashboard/riders');
    expect(ids(navGroups(accessFrom(session(['orders.view', 'orders.manage'], []))))).not.toContain('riders');
    // Kitchen staff see orders, not where riders are.
    expect(ids(navGroups(accessFrom(session(['kot.update', 'orders.view'], ['kds', 'online_ordering']))))).not.toContain('riders');
  });

  it('sends a rider to their own screen after sign-in, others to the dashboard', () => {
    expect(homePath({ next: 'dashboard', role: 'delivery', support: null })).toBe('/rider/');
    expect(homePath({ next: 'dashboard', role: 'cashier', support: null })).toBe('/dashboard');
    expect(homePath({ next: 'onboarding', role: 'owner', support: null })).toBe('/onboarding');
    expect(homePath({ next: 'platform', role: null, support: null })).toBe('/platform');
    const rider = accessFrom(session(['deliveries.run'], ['online_ordering']));
    expect(rider.rider).toBe(true);
    expect(ids(navGroups(rider))).toEqual(['overview']);
  });
});
