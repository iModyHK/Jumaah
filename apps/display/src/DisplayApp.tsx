import { StrictMode } from 'react';
import { createI18n } from '@jumaah/ui';
import { App } from './App';
import { EMPTY_EXTENSIONS, ExtensionsProvider, type DisplayExtensions } from './extensions';

/** The whole display app. Extensions add routes, links and strings. */
export function DisplayApp({ extensions = EMPTY_EXTENSIONS }: { extensions?: DisplayExtensions }) {
  createI18n(undefined, extensions.i18n);
  return (
    <StrictMode>
      <ExtensionsProvider value={extensions}>
        <App />
      </ExtensionsProvider>
    </StrictMode>
  );
}
