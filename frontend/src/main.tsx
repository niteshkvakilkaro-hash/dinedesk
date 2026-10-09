import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import App from './App';
import { ApiError, setUnauthorizedHandler } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Toaster } from '@/components/ui';
import '@/i18n';
import '@/styles/index.css';

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
      {/* reducedMotion="user": Motion drops movement for people who ask for less motion. */}
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <App />
          <Toaster />
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
