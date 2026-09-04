import { createApiClient, saveSession } from '@jumaah/ui';
import { store } from './state/store';

/** Singleton API client; the auth session lives in the store and is mirrored to localStorage. */
export const api = createApiClient({
  getSession: () => store.getState().session,
  setSession: (s) => {
    saveSession(s);
    store.setState({ session: s });
  },
  onUnauthorized: () => {
    saveSession(null);
    store.setState({ session: null, screen: 'pick' });
  },
});
