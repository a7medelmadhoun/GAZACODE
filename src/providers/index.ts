import type { Provider } from './types.js';
import { openaiProvider } from './openai.js';
import { geminiProvider } from './gemini.js';
import { anthropicProvider } from './anthropic.js';
import { openrouterProvider } from './openrouter.js';
import { zenProvider } from './zen.js';

export const providers: Record<string, Provider> = {
  openai: openaiProvider,
  gemini: geminiProvider,
  anthropic: anthropicProvider,
  openrouter: openrouterProvider,
  opencodezen: zenProvider,
};

export function getProvider(id: string): Provider | undefined {
  return providers[id];
}

export function listProviders(): Provider[] {
  return Object.values(providers);
}
