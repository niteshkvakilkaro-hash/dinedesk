import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

/**
 * Push alerts on this device for the signed-in staff member (new orders, bookings, room
 * bookings), through the dashboard's service worker (/sw.js). On iPhone they work once the
 * dashboard is added to the Home Screen (iOS 16.4+).
 */
export type PushState = 'unsupported' | 'server-off' | 'denied' | 'off' | 'on' | 'loading';

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function registerDashboardWorker() {
  if (!supported()) return Promise.resolve(null);
  return navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
}

export function usePush() {
  const [state, setState] = useState<PushState>('loading');
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supported()) return setState('unsupported');
    try {
      const info = (await api.get<{ enabled: boolean; public_key: string | null }>('/tenant/push')).data;
      if (!info.enabled || !info.public_key) return setState('server-off');
      setPublicKey(info.public_key);
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await registerDashboardWorker();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    } catch {
      setState('off');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const turnOn = async () => {
    if (!publicKey) return;
    setState('loading');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return setState(permission === 'denied' ? 'denied' : 'off');
    const reg = await registerDashboardWorker();
    if (!reg) return setState('unsupported');
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    await api.post('/tenant/push/subscribe', sub.toJSON());
    setState('on');
  };

  const turnOff = async () => {
    setState('loading');
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api.post('/tenant/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => null);
      await sub.unsubscribe();
    }
    setState('off');
  };

  const test = () => api.post('/tenant/push/test');

  return { state, turnOn, turnOff, test };
}
