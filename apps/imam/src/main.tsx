import './index.css';
import '@jumaah/ui/fonts.css';
import '@jumaah/ui/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createI18n } from '@jumaah/ui';
import { App } from './App';

createI18n();
document.documentElement.dataset.theme = 'dark';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
