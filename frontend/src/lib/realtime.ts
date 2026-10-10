import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type Echo from 'laravel-echo';
import { request } from './api';

/**
 * Live updates for the dashboard over Laravel Reverb (WebSockets). Each business has
 * private channels per topic (tenant.{id}.orders / kitchen / tables / reservations); an
 * event only says "something changed", and screens refetch through the normal API.
 * If the socket is unavailable, screens keep polling (more slowly while connected).
 * Echo and the Pusher client are loaded only when a dashboard screen asks for live data.
 */
export type LiveTopic = 'orders' | 'kitchen' | 'tables' | 'reservations' | 'hotel';

export const useLiveStatus = create<{ connected: boolean; set: (v: boolean) => void }>((set) => ({ connected: false, set: (connected) => set({ connected }) }));

let echo: Promise<Echo<'reverb'> | null> | null = null;

function connect(): Promise<Echo<'reverb'> | null> {
  const key = import.meta.env.VITE_REVERB_APP_KEY as string | undefined;
  if (!key || typeof window === 'undefined') return Promise.resolve(null);
  echo ??= Promise.all([import('laravel-echo'), import('pusher-js')])
    .then(([{ default: EchoClass }, { default: Pusher }]) => {
      (window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;
      const scheme = (import.meta.env.VITE_REVERB_SCHEME as string | undefined) ?? 'http';
      const port = Number(import.meta.env.VITE_REVERB_PORT ?? 8080);
      const instance = new EchoClass({
        broadcaster: 'reverb',
        key,
        wsHost: (import.meta.env.VITE_REVERB_HOST as string | undefined) || window.location.hostname,
        wsPort: port,
        wssPort: port,
        forceTLS: scheme === 'https',
        enabledTransports: ['ws', 'wss'],
        // Private channels are authorised with the dashboard's API token.
        authorizer: (channel: { name: string }) => ({
          authorize: (socketId: string, callback: (error: Error | null, data: { auth: string } | null) => void) => {
            request<unknown>('/broadcasting/auth', { method: 'POST', body: { socket_id: socketId, channel_name: channel.name } })
              .then((res) => callback(null, res as unknown as { auth: string }))
              .catch((e: Error) => callback(e, null));
          },
        }),
      });
      const conn = instance.connector.pusher.connection;
      conn.bind('state_change', ({ current }: { current: string }) => useLiveStatus.getState().set(current === 'connected'));
      return instance;
    })
    .catch(() => null);
  return echo;
}

/** Disconnect on sign-out. */
export function disconnectLive() {
  void echo?.then((e) => e?.disconnect());
  echo = null;
  useLiveStatus.getState().set(false);
}

/**
 * Subscribes to a business topic while the component is mounted and calls `onEvent`
 * for every event on it (event name and payload).
 */
export function useLive(tenantKey: string | undefined | null, topic: LiveTopic, enabled: boolean, onEvent: (name: string, payload: Record<string, unknown>) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!enabled || !tenantKey) return;
    let channelName: string | null = null;
    let alive = true;
    void connect().then((e) => {
      if (!e || !alive) return;
      channelName = `tenant.${tenantKey}.${topic}`;
      // Every event on the channel (names like ".order.changed" from broadcastAs).
      e.private(channelName).listenToAll((event: string, data: Record<string, unknown>) => handler.current(event.replace(/^\./, ''), data ?? {}));
    });
    return () => {
      alive = false;
      if (channelName) void echo?.then((e) => e?.leave(channelName!));
    };
  }, [tenantKey, topic, enabled]);
}

/** Polling interval: slower while live updates are connected. */
export function usePollInterval(base: number) {
  const connected = useLiveStatus((s) => s.connected);
  return connected ? Math.max(base * 6, 60_000) : base;
}
