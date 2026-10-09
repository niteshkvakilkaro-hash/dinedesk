/**
 * API client for the Laravel backend (/api/v1). Every response has the
 * envelope { data, message, errors, meta }.
 *
 * Tenant resolution: the backend works out which business a request belongs
 * to from the host the visitor is on. Because the API may live on another
 * origin (or behind the dev proxy, which rewrites Host), we always send the
 * page's host in X-Tenant-Host.
 */

const ROOT = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const API_BASE = `${ROOT}/api/v1`;

export interface Envelope<T> {
  data: T;
  message: string | null;
  errors: Record<string, string[]> | null;
  meta: Record<string, unknown> | null;
}

export interface Paginated {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]> | null;

  constructor(message: string, status: number, errors: Record<string, string[]> | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiToken(value: string | null) {
  token = value;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

type Params = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Params;
  signal?: AbortSignal;
}

function buildUrl(path: string, params?: Params) {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    search.set(key, value === true ? '1' : String(value));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function request<T>(path: string, { method = 'GET', body, params, signal }: RequestOptions = {}): Promise<Envelope<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Tenant-Host': window.location.host,
  };
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 && token && onUnauthorized) onUnauthorized();
    const fallback =
      response.status === 429
        ? 'Too many attempts. Please wait a moment.'
        : response.status >= 500
          ? 'Something went wrong on our side. Please try again.'
          : 'Request failed.';
    throw new ApiError(payload?.message || fallback, response.status, payload?.errors ?? null);
  }

  return payload ?? ({ data: null, message: null, errors: null, meta: null } as Envelope<T>);
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>(path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Copies 422 field errors into a react-hook-form instance. Returns true if any were applied. */
export function applyServerErrors(
  error: unknown,
  setError: (name: never, value: { type: string; message: string }) => void,
): boolean {
  if (!(error instanceof ApiError) || !error.errors) return false;
  for (const [field, messages] of Object.entries(error.errors)) {
    setError(field as never, { type: 'server', message: messages[0] });
  }
  return true;
}
