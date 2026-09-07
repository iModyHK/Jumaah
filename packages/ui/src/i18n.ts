import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from '@jumaah/core/i18n/ar.json';
import en from '@jumaah/core/i18n/en.json';

export type UiLocale = 'ar' | 'en';

const STORAGE_KEY = 'jumaah.locale';

export function detectLocale(fallback: UiLocale = 'ar'): UiLocale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    /* ignore */
  }
  return fallback;
}

type Resources = Record<string, unknown>;

/** Deep merge of translation trees: extension strings are added to the core ones. */
function mergeResources(base: Resources, extra: Resources | undefined): Resources {
  if (!extra) return base;
  const out: Resources = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    const b = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b) ? mergeResources(b as Resources, v as Resources) : v;
  }
  return out;
}

/** Initialise i18next with the core ar/en resources (plus an extension's) and keep <html dir/lang> in sync. */
export function createI18n(initial?: UiLocale, extra?: { ar: Resources; en: Resources }): i18n {
  const lng = initial ?? detectLocale();
  if (!i18next.isInitialized) {
    void i18next.use(initReactI18next).init({
      resources: { ar: { translation: mergeResources(ar as Resources, extra?.ar) }, en: { translation: mergeResources(en as Resources, extra?.en) } },
      lng,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  }
  applyDocumentDirection(lng);
  i18next.on('languageChanged', (l) => {
    applyDocumentDirection(l as UiLocale);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  });
  return i18next;
}

export function applyDocumentDirection(locale: UiLocale | string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
}

export function setLocale(locale: UiLocale): void {
  void i18next.changeLanguage(locale);
}

export function currentLocale(): UiLocale {
  return (i18next.language as UiLocale) === 'en' ? 'en' : 'ar';
}
