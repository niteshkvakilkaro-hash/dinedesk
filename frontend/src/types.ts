export type Role = 'owner' | 'manager' | 'cashier' | 'waiter' | 'kitchen' | 'front_desk' | 'housekeeping';

export interface Outlet {
  id: string;
  name: string;
  city: string | null;
  is_main: boolean;
  current: boolean;
}
export type BusinessType = 'restaurant' | 'cafe' | 'cloud_kitchen' | 'hotel';
export type TenantStatus = 'onboarding' | 'live' | 'suspended' | 'read_only';
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DayHours {
  closed: boolean;
  open: string | null;
  close: string | null;
}
export type OpeningHours = Record<DayKey, DayHours>;

export interface Session {
  user: { id: number; name: string; email: string | null; phone: string | null; locale: string; is_platform_admin: boolean };
  tenant: null | {
    id: string;
    name: string;
    slug: string;
    business_type: BusinessType;
    city: string | null;
    status: TenantStatus;
    onboarding_step: number;
    is_demo: boolean;
    site_host: string;
    plan: { code: string; name: string };
    subscription: { status: string; trial_ends_at: string | null; grace_ends_at: string | null; current_period_ends_at: string | null; cancel_at_period_end: boolean } | null;
    is_branch: boolean;
  };
  /** A super admin inside this business for support. */
  support: { reason: string; read_only: boolean; expires_at: string } | null;
  /** Outlets of the same business this person can switch to (empty with one outlet). */
  branches: Outlet[];
  role: Role | null;
  permissions: string[];
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
  next: 'onboarding' | 'dashboard' | 'platform';
}

export interface AuthResult {
  token: string;
  session: Session;
}

export interface StaffMember {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: 'active' | 'disabled';
  last_login_at: string | null;
  created_at: string;
}

export interface PlatformTenantRow {
  id: string;
  name: string;
  slug: string;
  site_host: string;
  business_type: BusinessType;
  city: string | null;
  status: TenantStatus;
  is_demo: boolean;
  plan: { code: string; name: string };
  subscription_status: string | null;
  trial_ends_at: string | null;
  mrr: number;
  owner_name: string | null;
  owner_contact: string | null;
  users_count: number | null;
  created_at: string;
  last_active_at: string | null;
}

export interface PlatformTenantDetail extends PlatformTenantRow {
  gstin: string | null;
  timezone: string;
  onboarding_step: number;
  owner: { name: string; email: string | null; phone: string | null } | null;
  domains: { domain: string; type: string; is_primary: boolean; verified: boolean }[];
  subscriptions: { plan: string; status: string; billing_cycle: string; trial_ends_at: string | null; created_at: string }[];
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
  overrides: { feature: string; enabled: boolean; reason: string; expires_at: string | null }[];
  recent_activity: { action: string; by: string | null; meta: Record<string, unknown> | null; at: string }[];
}

export interface Plan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  price_monthly: string | null;
  price_yearly: string | null;
  features: string[];
  limits: Record<string, number | null>;
  is_active: boolean;
}
