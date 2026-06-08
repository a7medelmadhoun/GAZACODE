import type { Provider } from './types.js';
import { parseSseStream } from '../ui/sse.js';

export const geminiProvider: Provider = {
  info: {
    id: 'gemini',
    name: 'Google Gemini',
    emoji: 'G',
    defaultModel: 'gemini-2.5-pro',
    models: [
      { id: 'gemini-3.5-flash', description: 'Latest flash · fast & capable' },
      { id: 'gemini-3.1-pro-preview', description: 'Latest pro preview' },
      { id: 'gemini-3.1-flash-lite', description: 'Lightweight flash' },
      { id: 'gemini-2.5-pro', description: 'Production pro · deep reasoning' },
      { id: 'gemini-2.5-flash', description: 'Production flash · thinking' },
      { id: 'gemini-2.5-flash-lite', description: 'Production lightweight' },
    ],
    keyHint: 'Google AI Studio API key',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    color: '#4285f4',
  },

  async streamChat({ model, apiKey, messages, onChunk, signal }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:streamGenerateContent?alt=sse`;

    const systemMessage = messages.find((m) => m.role === 'system')?.content;
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = { contents };
    if (systemMessage) {
      body.systemInstruction = { parts: [{ text: systemMessage }] };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini API error (${res.status}): ${text || res.statusText}`);
    }

    for await (const event of parseSseStream(res.body)) {
      try {
        const json = JSON.parse(event.data);
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) onChunk(text);
      } catch {
        // ignore non-JSON frames
      }
    }
  },
};
