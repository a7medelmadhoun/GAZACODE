import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';

marked.use(
  markedTerminal({
    reflowText: true,
    width: Math.min(process.stdout.columns || 100, 100),
    tab: 2,
    gfm: true,
    code: chalk.cyan,
    blockquote: chalk.gray.italic,
    heading: chalk.bold.cyanBright,
    firstHeading: chalk.bold.cyanBright,
    hr: chalk.gray,
    listitem: chalk.gray,
    paragraph: chalk.white,
    table: chalk.gray,
    tableSeparator: chalk.gray,
    codespan: chalk.cyan,
    strong: chalk.bold,
    em: chalk.italic,
    del: chalk.strikethrough,
    link: chalk.blue.underline,
    href: chalk.blue.underline,
  }) as any
);

export function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?|```/g, ''))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}
