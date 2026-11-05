export type Actor = {
  id: string;
  email: string;
  role: string;
  isPlatformAdmin: boolean;
  storeIds: string[];
  permissions: string[];
};

const configuredApi = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const api = configuredApi.endsWith('/api/v1')
  ? configuredApi
  : `${configuredApi.replace(/\/$/, '')}/api/v1`;
let accessToken: string | null = null;
let currentActor: Actor | null = null;
let refreshPromise: Promise<Actor> | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function clearSession() {
  accessToken = null;
  currentActor = null;
}

async function readError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === 'object' && 'message' in body) {
    const message = body.message;
    return Array.isArray(message) ? message.join(', ') : String(message);
  }
  return 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
}

async function refreshSession(): Promise<Actor> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(`${api}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        clearSession();
        throw new ApiError(response.status, 'Phiên đăng nhập đã hết hạn.');
      }
      const body = (await response.json()) as { accessToken: string; user: Actor };
      accessToken = body.accessToken;
      currentActor = body.user;
      return body.user;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function login(email: string, password: string): Promise<Actor> {
  const response = await fetch(`${api}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new ApiError(response.status, 'Email hoặc mật khẩu không đúng.');
  const body = (await response.json()) as { accessToken: string; user: Actor };
  accessToken = body.accessToken;
  currentActor = body.user;
  return body.user;
}

export async function getActor(): Promise<Actor> {
  return currentActor && accessToken ? currentActor : refreshSession();
}

async function send(path: string, options: RequestInit): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(`${api}${path}`, { ...options, credentials: 'include', headers });
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  await getActor();
  let response = await send(path, options);
  if (response.status === 401) {
    // Access tokens are short-lived. Rotate the httpOnly refresh cookie once,
    // then replay the original safe-or-command request exactly once.
    clearSession();
    await refreshSession();
    response = await send(path, options);
    if (response.status === 401) clearSession();
  }
  if (!response.ok) throw new ApiError(response.status, await readError(response));
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text.trim()) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null as T;
  }
}

export async function downloadProtectedFile(path: string, filename: string): Promise<void> {
  await getActor();
  let response = await send(path, { method: 'GET' });
  if (response.status === 401) {
    clearSession();
    await refreshSession();
    response = await send(path, { method: 'GET' });
  }
  if (!response.ok) throw new ApiError(response.status, await readError(response));
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export async function logout(): Promise<void> {
  if (accessToken)
    await fetch(`${api}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { authorization: `Bearer ${accessToken}` },
    });
  clearSession();
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý nhà hàng',
  CASHIER: 'Thu ngân',
  KITCHEN: 'Nhân viên bếp',
  INVENTORY_CLERK: 'Nhân viên kho',
};

export function getDefaultRouteForActor(actor: Actor): string {
  if (actor.permissions.includes('reports.read')) return '/admin';
  if (actor.permissions.includes('orders.create')) return '/pos';
  if (actor.permissions.includes('fulfillment.read')) return '/kds/frying';
  if (actor.permissions.includes('inventory.read')) return '/admin/inventory';
  if (actor.permissions.includes('identity.read')) return '/admin/team';
  if (actor.permissions.includes('catalog.read')) return '/admin/catalog/categories';
  if (actor.permissions.includes('orders.read')) return '/orders';
  return '/';
}

export function hasPermission(actor: Actor | null, permission: string): boolean {
  return actor?.permissions.includes(permission) ?? false;
}
