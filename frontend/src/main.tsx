import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ApiError, setUnauthorizedHandler } from '@/lib/api';
import { isSupportTab, useAuthStore } from '@/stores/auth';
import '@/i18n';
import '@/styles/index.css';
import { getTheme, isThemeKey } from '@/themes/registry';
import { installAppDownloads } from '@/lib/dinedeskApp';

// Inside the DineDesk Android app, QR images and other download links are saved through the app.
installAppDownloads();

// Business website: start downloading its theme as soon as the early /site response names it.
void window.__ddSite?.then((res) => {
  const key = (res?.data as { theme?: { key?: string } } | undefined)?.theme?.key;
  if (isThemeKey(key)) void getTheme(key).load();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
    },
  },
});

// An expired or revoked token signs the user out everywhere in the app. In a support tab it only
// means the support session is over: back to the super admin's own sign-in.
setUnauthorizedHandler(() => {
  if (isSupportTab()) useAuthStore.getState().leaveSupport('expired');
  else useAuthStore.getState().setToken(null);
  queryClient.clear();
});

// A pre-rendered marketing page keeps its HTML on screen until the app shows the same page
// (features/marketing/seo.ts → showApp); never longer than 10 s, whatever happens.
const rootEl = document.getElementById('root')!;
if (document.getElementById('prerender')) {
  rootEl.style.display = 'none';
  setTimeout(() => {
    document.getElementById('prerender')?.remove();
    rootEl.style.display = '';
  }, 10_000);
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
