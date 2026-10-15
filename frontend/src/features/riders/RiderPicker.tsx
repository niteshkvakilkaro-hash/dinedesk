import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui';
import { useAssignRider, type RiderRow } from './api';

/** Choose the rider for a delivery order (riders on duty first); the empty choice takes it back. */
export function RiderPicker({ orderId, number, riders, current }: { orderId: number; number: number; riders: Pick<RiderRow, 'id' | 'name' | 'on_duty'>[]; current?: number | null }) {
  const { t } = useTranslation();
  const assign = useAssignRider();
  const sorted = [...riders].sort((a, b) => Number(b.on_duty) - Number(a.on_duty));
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="sr-only">{t('riders.assignTo', { number })}</span>
      <select
        className="field-input !w-auto min-w-0 max-w-full !py-2 text-sm"
        value={current ?? ''}
        disabled={assign.isPending}
        onChange={(e) => assign.mutate({ orderId, riderId: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">{current ? t('riders.noRider') : t('riders.choose')}</option>
        {sorted.map((r) => (
          <option key={r.id} value={r.id}>
            {r.on_duty ? r.name : t('riders.nameOffDuty', { name: r.name })}
          </option>
        ))}
      </select>
      {assign.isPending && <Spinner className="h-4 w-4" />}
    </label>
  );
}
