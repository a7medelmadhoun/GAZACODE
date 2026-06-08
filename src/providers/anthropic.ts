import type { Provider } from './types.js';
import { parseSseStream } from '../ui/sse.js';

export const anthropicProvider: Provider = {
  info: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    emoji: 'A',
    defaultModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-opus-4-8', description: 'Most capable · complex reasoning & coding' },
      { id: 'claude-opus-4-7', description: 'Premium reasoning' },
      { id: 'claude-opus-4-6', description: 'Deep reasoning · 1M context' },
      { id: 'claude-sonnet-4-6', description: 'Best speed/intelligence balance · 1M ctx' },
      { id: 'claude-sonnet-4-5', description: 'Strong all-rounder' },
      { id: 'claude-haiku-4-5', description: 'Fastest · near-frontier intelligence' },
    ],
    keyHint: 'starts with sk-ant-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    color: '#d97706',
  },

  async streamChat({ model, apiKey, messages, onChunk, signal }) {
    const systemMessage = messages.find((m) => m.role === 'system')?.content;
    const convo = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: systemMessage,
        messages: convo,
        stream: true,
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic API error (${res.status}): ${text || res.statusText}`);
    }

    for await (const event of parseSseStream(res.body)) {
      if (event.event === 'content_block_delta') {
        try {
          const json = JSON.parse(event.data);
          const text = json.delta?.text;
          if (text) onChunk(text);
        } catch {
          // ignore
        }
      }
    }
  },
};
