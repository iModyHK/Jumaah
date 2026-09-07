import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createI18n, ApiRequestError } from '@jumaah/ui';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './components/Toast';
import { EMPTY_EXTENSIONS, ExtensionsProvider, type AdminExtensions } from './extensions';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiRequestError && err.status >= 400 && err.status < 500) && count < 2,
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
});

/** The whole admin app: providers, router and pages. Extensions add pages, cards and strings. */
export function AdminApp({ extensions = EMPTY_EXTENSIONS }: { extensions?: AdminExtensions }) {
  createI18n(undefined, extensions.i18n);
  return (
    <StrictMode>
      <ExtensionsProvider value={extensions}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter basename="/admin">
            <AuthProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ExtensionsProvider>
    </StrictMode>
  );
}
