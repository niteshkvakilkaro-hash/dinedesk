/**
 * In-app alerts on the dashboard (GET /tenant/alerts): the server stores plain values and a
 * `kind`; the text is written here, in the language the reader uses now. Pure, so it's easy
 * to test. Kinds this dashboard doesn't know yet are left out.
 */
export interface InAppAlert {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  created_at: string | null;
}

export interface AlertView {
  text: string;
  to: string;
  linkLabel: string;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function describeAlert(alert: InAppAlert, t: Translate, date: (iso: string) => string): AlertView | null {
  if (alert.kind === 'referral.reward') {
    const d = alert.data;
    const business = String(d.business ?? '');
    const days = Number(d.days ?? 0);
    if (!business || !days) return null;
    const until = typeof d.until === 'string' && d.until ? d.until : null;
    return {
      text: d.status === 'granted' && until
        ? t('inAppAlerts.referral.granted', { business, days, date: date(until) })
        : t('inAppAlerts.referral.pending', { business, days }),
      to: '/dashboard/billing?open=refer',
      linkLabel: t('inAppAlerts.referral.open'),
    };
  }
  return null;
}
