export type TextDirection = 'rtl' | 'ltr';

export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  dir: TextDirection;
  /** CSS font-family stack; fonts are bundled locally via @fontsource packages (no CDN). */
  fontFamily: string;
  /** Line-height multiplier for scripts that need more vertical room (Nastaliq, Bengali). */
  lineHeight: number;
}

const LATIN = "'Noto Sans', system-ui, sans-serif";
const ARABIC = "'Noto Naskh Arabic', 'Amiri', serif";

export const LANGUAGES: Record<string, LanguageInfo> = {
  ar: { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl', fontFamily: ARABIC, lineHeight: 1.9 },
  en: { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', fontFamily: LATIN, lineHeight: 1.5 },
  ur: { code: 'ur', name: 'Urdu', nativeName: 'اردو', dir: 'rtl', fontFamily: "'Noto Nastaliq Urdu', 'Noto Naskh Arabic', serif", lineHeight: 2.2 },
  bn: { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', dir: 'ltr', fontFamily: "'Noto Sans Bengali', sans-serif", lineHeight: 1.8 },
  tr: { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', dir: 'ltr', fontFamily: LATIN, lineHeight: 1.5 },
  id: { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', dir: 'ltr', fontFamily: LATIN, lineHeight: 1.5 },
  ms: { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', dir: 'ltr', fontFamily: LATIN, lineHeight: 1.5 },
  tl: { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog', dir: 'ltr', fontFamily: LATIN, lineHeight: 1.5 },
  am: { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', dir: 'ltr', fontFamily: "'Noto Sans Ethiopic', sans-serif", lineHeight: 1.7 },
  zh: { code: 'zh', name: 'Chinese', nativeName: '中文', dir: 'ltr', fontFamily: "'Noto Sans SC', sans-serif", lineHeight: 1.7 },
  fr: { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr', fontFamily: LATIN, lineHeight: 1.5 },
  es: { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr', fontFamily: LATIN, lineHeight: 1.5 },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr', fontFamily: LATIN, lineHeight: 1.5 },
  ru: { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr', fontFamily: LATIN, lineHeight: 1.5 },
  hi: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr', fontFamily: "'Noto Sans Devanagari', sans-serif", lineHeight: 1.8 },
  fa: { code: 'fa', name: 'Persian', nativeName: 'فارسی', dir: 'rtl', fontFamily: ARABIC, lineHeight: 1.9 },
  ps: { code: 'ps', name: 'Pashto', nativeName: 'پښتو', dir: 'rtl', fontFamily: ARABIC, lineHeight: 1.9 },
  so: { code: 'so', name: 'Somali', nativeName: 'Soomaali', dir: 'ltr', fontFamily: LATIN, lineHeight: 1.5 },
  sw: { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', dir: 'ltr', fontFamily: LATIN, lineHeight: 1.5 },
  ha: { code: 'ha', name: 'Hausa', nativeName: 'Hausa', dir: 'ltr', fontFamily: LATIN, lineHeight: 1.5 },
  ta: { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', dir: 'ltr', fontFamily: "'Noto Sans Tamil', sans-serif", lineHeight: 1.8 },
  ml: { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', dir: 'ltr', fontFamily: "'Noto Sans Malayalam', sans-serif", lineHeight: 1.8 },
};

export const LANGUAGE_CODES = Object.keys(LANGUAGES);

export function getLanguage(code: string): LanguageInfo {
  return (
    LANGUAGES[code] ?? {
      code,
      name: code,
      nativeName: code,
      dir: 'ltr',
      fontFamily: LATIN,
      lineHeight: 1.5,
    }
  );
}

export function isRtl(code: string): boolean {
  return getLanguage(code).dir === 'rtl';
}
