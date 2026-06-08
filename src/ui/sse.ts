import { createInterface } from 'readline';

export interface SseEvent {
  event?: string;
  data: string;
}

export async function* parseSseStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) {
        const final = parseSseChunk(buffer);
        if (final) yield final;
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    let currentEvent: SseEvent = { data: '' };
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      if (line === '') {
        if (currentEvent.data) {
          yield currentEvent;
          currentEvent = { data: '' };
        }
        continue;
      }
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        currentEvent.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const value = line.slice(5).trim();
        currentEvent.data += currentEvent.data ? `\n${value}` : value;
      }
    }
  }
}

function parseSseChunk(raw: string): SseEvent | null {
  const event: SseEvent = { data: '' };
  for (const line of raw.split('\n')) {
    const trimmed = line.replace(/\r$/, '');
    if (trimmed.startsWith('event:')) event.event = trimmed.slice(6).trim();
    else if (trimmed.startsWith('data:')) {
      const value = trimmed.slice(5).trim();
      event.data += event.data ? `\n${value}` : value;
    }
  }
  return event.data ? event : null;
}

export async function promptLine(question: string, silent = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    if (silent) {
      (rl as any).stdoutMuted = true;
      (rl as any)._writeToOutput = function (str: string) {
        if ((rl as any).stdoutMuted) {
          (rl as any).output.write(str.replace(/[^\r\n]/g, '*'));
        } else {
          (rl as any).output.write(str);
        }
      };
    }
    rl.once('line', (answer) => {
      rl.close();
      if (silent) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}
