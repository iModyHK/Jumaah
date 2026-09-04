import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { store, useAppState } from './state/store';
import { connectLive, disconnectLive } from './state/live';
import { Login } from './screens/Login';
import { PickKhutbah } from './screens/PickKhutbah';
import { Live } from './screens/Live';
import { ConfirmDialog } from './components/ConfirmDialog';

export function App() {
  const { t } = useTranslation();
  const { session, screen, conflict } = useAppState();
  const loggedIn = !!session;

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
  }, []);

  useEffect(() => {
    if (loggedIn) connectLive();
    else disconnectLive();
  }, [loggedIn]);

  if (!loggedIn) return <Login />;

  return (
    <>
      {screen === 'live' ? <Live /> : <PickKhutbah />}
      <ConfirmDialog
        open={conflict !== null}
        title={t('errors.SESSION_ACTIVE')}
        message={conflict?.message ?? ''}
        confirmLabel={t('common.close')}
        onConfirm={() => store.setState({ conflict: null })}
      />
    </>
  );
}
