import type { Provider } from './types.js';
import { parseSseStream } from '../ui/sse.js';

export const openaiProvider: Provider = {
  info: {
    id: 'openai',
    name: 'OpenAI',
    emoji: 'O',
    defaultModel: 'gpt-5.5',
    models: [
      { id: 'gpt-5.5', description: 'Flagship complex reasoning & coding' },
      { id: 'gpt-5.4', description: 'High performance general' },
      { id: 'gpt-5.4-pro', description: 'Enhanced reasoning & coding' },
      { id: 'gpt-5.4-mini', description: 'Fast & cost-efficient' },
      { id: 'gpt-5.4-nano', description: 'Lowest latency, lowest cost' },
      { id: 'o3', description: 'Deep reasoning model' },
      { id: 'o4-mini', description: 'Fast reasoning, cost-efficient' },
    ],
    keyHint: 'starts with sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
    color: '#10a37f',
  },

  async streamChat({ model, apiKey, messages, onChunk, signal }) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
      throw new Error(`OpenAI API error (${res.status}): ${text || res.statusText}`);
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
