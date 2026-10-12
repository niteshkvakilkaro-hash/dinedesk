import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, EyeOff, FileSpreadsheet, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { useSession } from '@/hooks/useSession';
import { Alert, Badge, DemoBadge, EmptyState, ErrorState, SkeletonRows, toast } from '@/components/ui';
import { FoodTypeMark } from '@/site/components/bits';
import type { AdminCategory, AdminGroup, AdminItem } from './api';
import { useAdminMenu, useMenuMutation } from './api';
import { DishEditor, GroupEditor, ImportDialog, SectionEditor } from './editors';

type Tab = 'dishes' | 'extras';

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-success' : 'bg-ink/25'}`}>
      <span className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

export default function MenuPage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const query = useAdminMenu();
  const [tab, setTab] = useState<Tab>('dishes');
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<{ open: boolean; category: AdminCategory | null }>({ open: false, category: null });
  const [dish, setDish] = useState<{ open: boolean; item: AdminItem | null; categoryId: number }>({ open: false, item: null, categoryId: 0 });
  const [group, setGroup] = useState<{ open: boolean; group: AdminGroup | null }>({ open: false, group: null });
  const [importing, setImporting] = useState(false);

  const availability = useMenuMutation(({ id, is_available }: { id: number; is_available: boolean }) => api.patch(`/tenant/menu/items/${id}/availability`, { is_available }));
  const removeItem = useMenuMutation((id: number) => api.delete(`/tenant/menu/items/${id}`));
  const removeCategory = useMenuMutation((id: number) => api.delete(`/tenant/menu/categories/${id}`));
  const removeGroup = useMenuMutation((id: number) => api.delete(`/tenant/menu/addon-groups/${id}`));
  const reorderCategories = useMenuMutation((ids: number[]) => api.put('/tenant/menu/categories/order', { ids }));
  const reorderItems = useMenuMutation(({ categoryId, ids }: { categoryId: number; ids: number[] }) => api.put(`/tenant/menu/categories/${categoryId}/items/order`, { ids }));
  const clearDemo = useMenuMutation(() => api.delete('/tenant/menu/demo'));

  const data = query.data;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!data) return [];
    return data.categories.map((c) => ({ ...c, items: q ? c.items.filter((i) => i.name.toLowerCase().includes(q) || i.name_hi?.toLowerCase().includes(q)) : c.items })).filter((c) => !q || c.items.length);
  }, [data, search]);

  if (query.isError) return <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />;
  if (!data) return <SkeletonRows rows={8} />;
  const { meta } = data;
  const atLimit = meta.items_limit !== null && meta.items_count >= meta.items_limit;
  const swap = <T,>(list: T[], i: number, d: -1 | 1) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return next;
  };
  const priceLabel = (i: AdminItem) => (i.variants.length ? i.variants.map((v) => `${v.name} ${formatINR(v.price)}`).join(' · ') : formatINR(i.price));
  const confirmThen = (message: string, fn: () => void) => window.confirm(message) && fn();
  const onErr = (e: Error) => toast.error(e.message);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t('menuAdmin.title')}</h1>
          <p className="text-muted">
            {meta.items_limit === null ? t('menuAdmin.countUnlimited', { count: meta.items_count }) : t('menuAdmin.count', { count: meta.items_count, limit: meta.items_limit })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline" onClick={() => setImporting(true)}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> {t('menuAdmin.import')}
          </button>
          <button type="button" className="btn-outline" onClick={() => setSection({ open: true, category: null })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t('menuAdmin.addSection')}
          </button>
          <button type="button" className="btn-primary" disabled={!data.categories.length || atLimit} onClick={() => setDish({ open: true, item: null, categoryId: data.categories[0]?.id ?? 0 })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t('menuAdmin.addDish')}
          </button>
        </div>
      </div>

      {meta.has_demo && (
        <Alert tone="info">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>{session?.tenant?.is_demo ? t('menuAdmin.demoBusiness') : t('menuAdmin.demoMenu')}</span>
            {!session?.tenant?.is_demo && (
              <button type="button" className="btn-outline !min-h-9 text-sm" onClick={() => confirmThen(t('menuAdmin.clearDemoConfirm'), () => clearDemo.mutate(undefined, { onSuccess: () => toast.success(t('menuAdmin.demoCleared')), onError: onErr }))}>
                {t('menuAdmin.clearDemo')}
              </button>
            )}
          </span>
        </Alert>
      )}
      {atLimit && <Alert tone="warn">{t('menuAdmin.limitReached')}</Alert>}

      <div role="tablist" className="flex gap-1 border-b border-line">
        {(['dishes', 'extras'] as Tab[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`relative min-h-11 px-4 text-sm font-semibold ${tab === k ? 'text-ink' : 'text-muted hover:text-ink'}`}>
            {t(`menuAdmin.tab.${k}`)}
            {tab === k && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      {tab === 'dishes' && (
        <>
          {data.categories.length === 0 ? (
            <EmptyState title={t('menuAdmin.emptyTitle')} action={<button type="button" className="btn-primary" onClick={() => setSection({ open: true, category: null })}>{t('menuAdmin.addSection')}</button>}>
              {t('menuAdmin.emptyHint')}
            </EmptyState>
          ) : (
            <>
              <label className="relative block max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input type="search" className="field-input !pl-9" placeholder={t('menuAdmin.search')} aria-label={t('menuAdmin.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              {filtered.map((c) => {
                const ci = data.categories.findIndex((x) => x.id === c.id);
                return (
                  <section key={c.id} className="card overflow-hidden" aria-labelledby={`sec-${c.id}`}>
                    <header className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-4 py-3">
                      <h2 id={`sec-${c.id}`} className="text-lg font-bold">{c.name}</h2>
                      {c.name_hi && <span className="text-muted" lang="hi">{c.name_hi}</span>}
                      {!c.is_active && <Badge tone="disabled"><EyeOff className="mr-1 h-3 w-3" aria-hidden="true" />{t('menuAdmin.hidden')}</Badge>}
                      {c.tax_rate && <Badge tone="neutral">GST {Number(c.tax_rate)}%</Badge>}
                      {c.is_demo && <DemoBadge />}
                      <span className="ml-auto flex items-center">
                        <button type="button" className="btn-ghost !min-h-10 !px-2.5" disabled={ci === 0 || !!search} onClick={() => reorderCategories.mutate(swap(data.categories, ci, -1).map((x) => x.id))}>
                          <ArrowUp className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('menuAdmin.moveUp', { name: c.name })}</span>
                        </button>
                        <button type="button" className="btn-ghost !min-h-10 !px-2.5" disabled={ci === data.categories.length - 1 || !!search} onClick={() => reorderCategories.mutate(swap(data.categories, ci, 1).map((x) => x.id))}>
                          <ArrowDown className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('menuAdmin.moveDown', { name: c.name })}</span>
                        </button>
                        <button type="button" className="btn-ghost !min-h-10 !px-2.5" onClick={() => setSection({ open: true, category: c })}>
                          <Pencil className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('menuAdmin.editNamed', { name: c.name })}</span>
                        </button>
                        <button type="button" className="btn-ghost !min-h-10 !px-2.5 text-danger" onClick={() => confirmThen(t('menuAdmin.deleteSectionConfirm', { name: c.name }), () => removeCategory.mutate(c.id, { onSuccess: () => toast.success(t('menuAdmin.deleted')), onError: onErr }))}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('menuAdmin.deleteNamed', { name: c.name })}</span>
                        </button>
                      </span>
                    </header>
                    {c.items.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-muted">{t('menuAdmin.noDishes')}</p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {c.items.map((i, ii) => (
                          <li key={i.id} className={`flex items-center gap-3 px-4 py-3 ${i.is_available ? '' : 'bg-paper/60'}`}>
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-paper">{i.image && <img src={i.image.src} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-2 font-semibold">
                                <FoodTypeMark type={i.food_type} />
                                <span className="truncate">{i.name}</span>
                                {i.is_demo && <DemoBadge />}
                              </p>
                              <p className="truncate text-sm text-muted">
                                {priceLabel(i)}
                                {i.addon_group_ids.length > 0 && ` · ${t('menuAdmin.extrasCount', { count: i.addon_group_ids.length })}`}
                                {i.is_bestseller && ` · ${t('site.bestseller')}`}
                                {i.is_chefs_special && ` · ${t('site.chefsSpecial')}`}
                              </p>
                            </div>
                            <span className={`hidden text-xs font-semibold sm:inline ${i.is_available ? 'text-success' : 'text-danger'}`}>{i.is_available ? t('menuAdmin.onMenu') : t('menuAdmin.soldOut')}</span>
                            <Switch checked={i.is_available} label={t('menuAdmin.availableNamed', { name: i.name })} onChange={(v) => availability.mutate({ id: i.id, is_available: v }, { onSuccess: () => toast.success(v ? t('menuAdmin.backOn', { name: i.name }) : t('menuAdmin.markedSoldOut', { name: i.name })), onError: onErr })} />
                            <span className="hidden items-center md:flex">
                              <button type="button" className="btn-ghost !min-h-10 !px-2" disabled={ii === 0 || !!search} onClick={() => reorderItems.mutate({ categoryId: c.id, ids: swap(c.items, ii, -1).map((x) => x.id) })}>
                                <ArrowUp className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('menuAdmin.moveUp', { name: i.name })}</span>
                              </button>
                              <button type="button" className="btn-ghost !min-h-10 !px-2" disabled={ii === c.items.length - 1 || !!search} onClick={() => reorderItems.mutate({ categoryId: c.id, ids: swap(c.items, ii, 1).map((x) => x.id) })}>
                                <ArrowDown className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('menuAdmin.moveDown', { name: i.name })}</span>
                              </button>
                            </span>
                            <button type="button" className="btn-ghost !min-h-10 !px-2.5" onClick={() => setDish({ open: true, item: i, categoryId: c.id })}>
                              <Pencil className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('menuAdmin.editNamed', { name: i.name })}</span>
                            </button>
                            <button type="button" className="btn-ghost !min-h-10 !px-2.5 text-danger" onClick={() => confirmThen(t('menuAdmin.deleteDishConfirm', { name: i.name }), () => removeItem.mutate(i.id, { onSuccess: () => toast.success(t('menuAdmin.deleted')), onError: onErr }))}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('menuAdmin.deleteNamed', { name: i.name })}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="border-t border-line px-4 py-2">
                      <button type="button" className="btn-ghost !min-h-10 text-sm" disabled={atLimit} onClick={() => setDish({ open: true, item: null, categoryId: c.id })}>
                        <Plus className="h-4 w-4" aria-hidden="true" /> {t('menuAdmin.addDishTo', { name: c.name })}
                      </button>
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </>
      )}

      {tab === 'extras' && (
        <div className="space-y-3">
          <p className="text-sm text-muted">{t('menuAdmin.extrasHint')}</p>
          <button type="button" className="btn-primary" onClick={() => setGroup({ open: true, group: null })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t('menuAdmin.addGroup')}
          </button>
          {data.addon_groups.length === 0 ? (
            <EmptyState title={t('menuAdmin.noGroups')} />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.addon_groups.map((g) => (
                <li key={g.id} className="card p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-bold">{g.name} {g.is_demo && <DemoBadge />}</p>
                      <p className="text-sm text-muted">
                        {g.min_select > 0 ? t('order.required', { count: g.min_select }) : t('order.optional')}
                        {g.max_select !== null && ` · ${t('order.upTo', { count: g.max_select })}`}
                        {` · ${t('menuAdmin.usedBy', { count: g.items_count ?? 0 })}`}
                      </p>
                    </div>
                    <button type="button" className="btn-ghost !min-h-10 !px-2.5" onClick={() => setGroup({ open: true, group: g })}>
                      <Pencil className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('menuAdmin.editNamed', { name: g.name })}</span>
                    </button>
                    <button type="button" className="btn-ghost !min-h-10 !px-2.5 text-danger" onClick={() => confirmThen(t('menuAdmin.deleteGroupConfirm', { name: g.name }), () => removeGroup.mutate(g.id, { onSuccess: () => toast.success(t('menuAdmin.deleted')), onError: onErr }))}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{t('menuAdmin.deleteNamed', { name: g.name })}</span>
                    </button>
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {g.addons.map((a) => (
                      <li key={a.id} className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold">
                        {a.name} · {formatINR(a.price)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {section.open && <SectionEditor key={section.category?.id ?? 'new'} category={section.category} stations={[...new Set(data.categories.map((c) => c.station).filter((s): s is string => !!s))]} open onClose={() => setSection({ open: false, category: null })} />}
      {dish.open && <DishEditor key={dish.item?.id ?? `new-${dish.categoryId}`} menu={data} allergens={meta.allergens} item={dish.item} categoryId={dish.categoryId} open onClose={() => setDish({ open: false, item: null, categoryId: 0 })} />}
      {group.open && <GroupEditor key={group.group?.id ?? 'new'} group={group.group} open onClose={() => setGroup({ open: false, group: null })} />}
      {importing && <ImportDialog open onClose={() => setImporting(false)} />}
    </div>
  );
}
