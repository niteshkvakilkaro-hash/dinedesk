import { useEffect, useState } from 'react';

/**
 * The business website as an installable app: its own manifest and icons (from the backend,
 * per business) and a tiny service worker. Phones show a splash screen from the manifest.
 */
export function setUpSiteApp() {
  const add = (rel: string, href: string) => {
    if (document.head.querySelector(`link[rel="${rel}"]`)) return;
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    document.head.appendChild(link);
  };
  add('manifest', '/site.webmanifest');
  add('apple-touch-icon', '/site-icon-192.png');
  if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/app-sw.js', { scope: '/' }).catch(() => null);
}

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
export const isIos = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

/** "Install app": the browser's own prompt where there is one; on iPhone, how to add it. */
export function useInstallApp() {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    ios: isIos(),
    install: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      listeners.forEach((l) => l());
      return outcome === 'accepted';
    },
  };
}
