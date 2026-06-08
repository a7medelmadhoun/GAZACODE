import type { Provider } from './types.js';
import { parseSseStream } from '../ui/sse.js';

export const openrouterProvider: Provider = {
  info: {
    id: 'openrouter',
    name: 'OpenRouter',
    emoji: 'R',
    defaultModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    models: [
      // ── Featured free models (curated) ──
      {
        id: 'meta-llama/llama-3.3-70b-instruct:free',
        free: true,
        ctx: 131072,
        description: 'Meta flagship · great all-rounder',
      },
      {
        id: 'qwen/qwen3-coder:free',
        free: true,
        ctx: 1048576,
        description: 'Best for coding · 1M context',
      },
      {
        id: 'openai/gpt-oss-120b:free',
        free: true,
        ctx: 131072,
        description: 'OpenAI open source · 120B',
      },
      {
        id: 'google/gemma-4-31b-it:free',
        free: true,
        ctx: 262144,
        description: 'Google flagship · 262K context',
      },
      {
        id: 'moonshotai/kimi-k2.6:free',
        free: true,
        ctx: 262144,
        description: 'Moonshot · strong general',
      },
      {
        id: 'meta-llama/llama-3.2-3b-instruct:free',
        free: true,
        ctx: 131072,
        description: 'Fast & tiny · 3B',
      },
      {
        id: 'openrouter/owl-alpha',
        free: true,
        ctx: 131072,
        description: 'OpenRouter Owl · alpha',
      },

      // ── More free models ──
      { id: 'qwen/qwen3-next-80b-a3b-instruct:free', free: true, ctx: 262144 },
      { id: 'google/gemma-4-26b-a4b-it:free', free: true, ctx: 262144 },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', free: true, ctx: 1000000 },
      { id: 'nvidia/nemotron-3-nano-30b-a3b:free', free: true, ctx: 256000 },
      { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', free: true, ctx: 256000 },
      { id: 'z-ai/glm-4.5-air:free', free: true, ctx: 131072 },
      { id: 'openai/gpt-oss-20b:free', free: true, ctx: 131072 },
      { id: 'meta-llama/llama-3.2-3b-instruct:free', free: true, ctx: 131072 },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', free: true, ctx: 131072 },
      {
        id: 'nousresearch/hermes-3-llama-3.1-405b:free',
        free: true,
        ctx: 131072,
        description: '405B beast',
      },
      { id: 'poolside/laguna-xs.2:free', free: true, ctx: 262144 },
      { id: 'poolside/laguna-m.1:free', free: true, ctx: 262144 },
      { id: 'nvidia/nemotron-nano-12b-v2-vl:free', free: true, ctx: 128000 },
      { id: 'nvidia/nemotron-nano-9b-v2:free', free: true, ctx: 128000 },
      {
        id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
        free: true,
        ctx: 32768,
        description: 'Uncensored · Venice',
      },
      { id: 'liquid/lfm-2.5-1.2b-thinking:free', free: true, ctx: 32768 },
      { id: 'liquid/lfm-2.5-1.2b-instruct:free', free: true, ctx: 32768 },

      // ── Premium models ──
      { id: 'openai/gpt-4o' },
      { id: 'openai/gpt-4o-mini' },
      { id: 'openai/gpt-4-turbo' },
      { id: 'anthropic/claude-3.5-sonnet' },
      { id: 'anthropic/claude-3.5-haiku' },
      { id: 'google/gemini-pro-1.5' },
      { id: 'google/gemini-flash-1.5' },
      { id: 'meta-llama/llama-3.1-405b-instruct' },
      { id: 'meta-llama/llama-3.1-70b-instruct' },
      { id: 'meta-llama/llama-3.1-8b-instruct' },
      { id: 'mistralai/mistral-large-latest' },
      { id: 'deepseek/deepseek-chat' },
      { id: 'qwen/qwen-2.5-72b-instruct' },
    ],
    keyHint: 'starts with sk-or-v1-...',
    keyUrl: 'https://openrouter.ai/keys',
    color: '#9b87f5',
  },

  async streamChat({ model, apiKey, messages, onChunk, signal }) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://gazacode.local',
        'X-Title': 'GAZACODE',
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter API error (${res.status}): ${text || res.statusText}`);
    }

    for await (const event of parseSseStream(res.body)) {
      if (event.data === '[DONE]') return;
      try {
        const json = JSON.parse(event.data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {
        // ignore non-JSON frames
      }
    }
  },
};
