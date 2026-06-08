import type { Provider } from './types.js';
import { parseSseStream } from '../ui/sse.js';

const ZEN_BASE = 'https://opencode.ai/zen/v1';

export const zenProvider: Provider = {
  info: {
    id: 'opencodezen',
    name: 'OpenCode Zen',
    emoji: 'Z',
    defaultModel: 'opencode/big-pickle',
    models: [
      { id: 'opencode/claude-opus-4-8', ctx: 200000 },
      { id: 'opencode/claude-opus-4-7', ctx: 200000 },
      { id: 'opencode/claude-opus-4-6', ctx: 200000 },
      { id: 'opencode/claude-opus-4-5', ctx: 200000 },
      { id: 'opencode/claude-opus-4-1', ctx: 200000 },
      { id: 'opencode/claude-sonnet-4-6', ctx: 200000 },
      { id: 'opencode/claude-sonnet-4-5', ctx: 200000 },
      { id: 'opencode/claude-sonnet-4', ctx: 200000 },
      { id: 'opencode/claude-haiku-4-5', ctx: 200000 },
      { id: 'opencode/gpt-5.5', ctx: 131072 },
      { id: 'opencode/gpt-5.5-pro', ctx: 131072 },
      { id: 'opencode/gpt-5.4', ctx: 131072 },
      { id: 'opencode/gpt-5.4-pro', ctx: 131072 },
      { id: 'opencode/gpt-5.4-mini', ctx: 131072 },
      { id: 'opencode/gpt-5.4-nano', ctx: 131072 },
      { id: 'opencode/gpt-5.3-codex', ctx: 131072 },
      { id: 'opencode/gpt-5.3-codex-spark', ctx: 131072 },
      { id: 'opencode/gpt-5.2', ctx: 131072 },
      { id: 'opencode/gpt-5.2-codex', ctx: 131072 },
      { id: 'opencode/gpt-5.1', ctx: 131072 },
      { id: 'opencode/gpt-5.1-codex', ctx: 131072 },
      { id: 'opencode/gpt-5.1-codex-max', ctx: 131072 },
      { id: 'opencode/gpt-5.1-codex-mini', ctx: 131072 },
      { id: 'opencode/gpt-5', ctx: 131072 },
      { id: 'opencode/gpt-5-codex', ctx: 131072 },
      { id: 'opencode/gpt-5-nano', ctx: 131072 },
      { id: 'opencode/gemini-3.5-flash', ctx: 1048576 },
      { id: 'opencode/gemini-3.1-pro', ctx: 1048576 },
      { id: 'opencode/gemini-3-flash', ctx: 1048576 },
      { id: 'opencode/grok-build-0.1', ctx: 131072 },
      { id: 'opencode/deepseek-v4-flash', ctx: 131072 },
      { id: 'opencode/glm-5.1', ctx: 131072 },
      { id: 'opencode/glm-5', ctx: 131072 },
      { id: 'opencode/minimax-m2.7', ctx: 1048576 },
      { id: 'opencode/minimax-m2.5', ctx: 1048576 },
      { id: 'opencode/kimi-k2.6', ctx: 131072 },
      { id: 'opencode/kimi-k2.5', ctx: 131072 },
      { id: 'opencode/qwen3.6-plus', ctx: 131072 },
      { id: 'opencode/qwen3.5-plus', ctx: 131072 },
      { id: 'opencode/big-pickle', ctx: 131072 },
      { id: 'opencode/deepseek-v4-flash-free', free: true, ctx: 131072 },
      { id: 'opencode/mimo-v2.5-free', free: true, ctx: 131072 },
      { id: 'opencode/qwen3.6-plus-free', free: true, ctx: 131072 },
      { id: 'opencode/minimax-m3-free', free: true, ctx: 1048576 },
      { id: 'opencode/nemotron-3-ultra-free', free: true, ctx: 256000 },
      { id: 'opencode/nemotron-3-super-free', free: true, ctx: 1000000 },
    ],
    keyHint: 'get from opencode.ai/auth',
    keyUrl: 'https://opencode.ai/auth',
    color: '#6c5ce7',
  },

  async streamChat({ model, apiKey, messages, onChunk, signal }) {
    const res = await fetch(`${ZEN_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenCode Zen API error (${res.status}): ${text || res.statusText}`);
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
