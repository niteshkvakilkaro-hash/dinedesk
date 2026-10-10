import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/lib/api';
import { GSTIN_REGEX } from '@/lib/format';
import { Alert, ErrorState, Field, SkeletonRows, Spinner, toast } from '@/components/ui';
import { HoursEditor, validateHours } from '@/components/HoursEditor';
import { HolidaysEditor } from '@/components/HolidaysEditor';
import type { Holiday } from '@/lib/openStatus';
import type { BusinessType, DayKey, OpeningHours } from '@/types';

interface BusinessDetails {
  name: string;
  business_type: BusinessType;
  city: string;
  gstin: string | null;
  timezone: string;
  opening_hours: OpeningHours;
  holidays: Holiday[];
}

export default function Business() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['business'], queryFn: async () => (await api.get<BusinessDetails>('/tenant/business')).data });
  const [form, setForm] = useState<BusinessDetails | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hourErrors, setHourErrors] = useState<Partial<Record<DayKey, string>>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: (body: BusinessDetails) => api.put<BusinessDetails>('/tenant/business', { name: body.name, city: body.city, gstin: body.gstin || null, opening_hours: body.opening_hours, holidays: body.holidays }),
    onSuccess: (res) => {
      toast.success(t('dashboard.business.saved'));
      qc.setQueryData(['business'], res.data);
      void qc.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (e: ApiError) => {
      if (e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      setError(e.message);
    },
  });

  if (query.isLoading || !form) return query.isError ? <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} /> : <SkeletonRows rows={6} />;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = t('onboarding.validation.name');
    if (form.city.trim().length < 2) errs.city = t('onboarding.validation.city');
    const g = (form.gstin ?? '').replace(/\s+/g, '').toUpperCase();
    if (g && !GSTIN_REGEX.test(g)) errs.gstin = t('onboarding.validation.gstin');
    const h = validateHours(form.opening_hours, t);
    setErrors(errs);
    setHourErrors(h);
    setError('');
    if (!Object.keys(errs).length && !Object.keys(h).length) save.mutate({ ...form, gstin: g || null });
  };

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-5" noValidate>
      <h1 className="text-3xl font-extrabold tracking-tight">{t('dashboard.business.title')}</h1>
      {error && <Alert>{error}</Alert>}
      <div className="card space-y-5 p-5">
        <Field label={t('onboarding.businessName')} error={errors.name}>
          {(a) => <input {...a} className="field-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={t('onboarding.city')} error={errors.city}>
            {(a) => <input {...a} className="field-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />}
          </Field>
          <Field label={t('onboarding.gstin')} optional hint={t('onboarding.gstinHint')} error={errors.gstin}>
            {(a) => <input {...a} className="field-input uppercase" maxLength={15} value={form.gstin ?? ''} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />}
          </Field>
        </div>
        <HoursEditor value={form.opening_hours} onChange={(opening_hours) => setForm({ ...form, opening_hours })} errors={hourErrors} />
      </div>
      <div className="card p-5">
        <HolidaysEditor value={form.holidays ?? []} onChange={(holidays) => setForm({ ...form, holidays })} />
      </div>
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : t('common.save')}
        </button>
      </div>
    </form>
  );
}
