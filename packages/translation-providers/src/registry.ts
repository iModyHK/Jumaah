import type { ProviderType } from '@jumaah/shared';
import { AnthropicProvider } from './providers/anthropic.js';
import { DeepLProvider } from './providers/deepl.js';
import { GoogleTranslateProvider } from './providers/google.js';
import { LibreTranslateProvider } from './providers/libretranslate.js';
import { ManualProvider } from './providers/manual.js';
import { OllamaProvider } from './providers/ollama.js';
import { OpenAiProvider } from './providers/openai.js';
import type { ProviderSettings, TranslationProvider } from './types.js';

export type ProviderFactory = (settings: ProviderSettings) => TranslationProvider;

const factories = new Map<ProviderType, ProviderFactory>([
  ['MANUAL', () => new ManualProvider()],
  ['ANTHROPIC', (s) => new AnthropicProvider(s)],
  ['OPENAI', (s) => new OpenAiProvider(s)],
  ['GOOGLE', (s) => new GoogleTranslateProvider(s)],
  ['DEEPL', (s) => new DeepLProvider(s)],
  ['LIBRETRANSLATE', (s) => new LibreTranslateProvider(s)],
  ['OLLAMA', (s) => new OllamaProvider(s)],
]);

/** Register a custom provider type (see README "Adding a provider"). */
export function registerProvider(type: ProviderType, factory: ProviderFactory): void {
  factories.set(type, factory);
}

export function createProvider(settings: ProviderSettings): TranslationProvider {
  const f = factories.get(settings.type);
  if (!f) throw new Error(`Unknown provider type: ${settings.type}`);
  return f(settings);
}

export function listProviderTypes(): ProviderType[] {
  return [...factories.keys()];
}

/** Metadata shown in the admin UI when adding a provider. */
export const PROVIDER_META: Record<ProviderType, { needsApiKey: boolean; needsBaseUrl: boolean; defaultModel?: string; offline: boolean }> = {
  MANUAL: { needsApiKey: false, needsBaseUrl: false, offline: true },
  ANTHROPIC: { needsApiKey: true, needsBaseUrl: false, defaultModel: 'claude-opus-5', offline: false },
  OPENAI: { needsApiKey: true, needsBaseUrl: false, defaultModel: 'gpt-4.1', offline: false },
  GOOGLE: { needsApiKey: true, needsBaseUrl: false, offline: false },
  DEEPL: { needsApiKey: true, needsBaseUrl: false, offline: false },
  LIBRETRANSLATE: { needsApiKey: false, needsBaseUrl: true, offline: true },
  OLLAMA: { needsApiKey: false, needsBaseUrl: true, defaultModel: 'qwen2.5:7b', offline: true },
  CLOUD: { needsApiKey: false, needsBaseUrl: false, offline: false },
};
