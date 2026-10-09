import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ApiError, setUnauthorizedHandler } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import '@/i18n';
import '@/styles/index.css';
import { getTheme, isThemeKey } from '@/themes/registry';

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

// An expired or revoked token signs the user out everywhere in the app.
setUnauthorizedHandler(() => {
  useAuthStore.getState().setToken(null);
  queryClient.clear();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
