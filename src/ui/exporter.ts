import type { Message } from '../providers/types.js';

export function formatAsMarkdown(
  messages: Message[],
  meta: { provider: string; model: string; createdAt: Date }
): string {
  const lines: string[] = [];

  lines.push('# GAZACODE Conversation');
  lines.push('');
  lines.push(`**Date:**    ${meta.createdAt.toISOString()}`);
  lines.push(`**Provider:** ${meta.provider}`);
  lines.push(`**Model:**   ${meta.model}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') {
      lines.push(`**You:**`);
      lines.push('');
      lines.push(m.content);
      lines.push('');
    } else if (m.role === 'assistant') {
      lines.push(`**Assistant:**`);
      lines.push('');
      lines.push(m.content);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}
