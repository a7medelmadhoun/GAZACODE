import chalk from 'chalk';
import boxen from 'boxen';

type Color = 'green' | 'red' | 'yellow' | 'cyan' | 'gray' | 'magenta';

interface BoxOptions {
  title: string;
  body: string;
  color: Color;
  icon: string;
}

function bigBox({ title, body, color, icon }: BoxOptions): void {
  const box = boxen(body, {
    title: `${icon} ${title}`,
    titleAlignment: 'center',
    padding: 1,
    margin: { top: 1, bottom: 1 },
    borderStyle: 'round',
    borderColor: color,
  });
  console.log(box);
}

function statusLine(text: string): void {
  console.log('  ' + chalk.gray('│') + '  ' + text);
}

export const notify = {
  // ─────────────── Connection events ───────────────

  connectionEstablished(provider: string, model: string, providerColor: string): void {
    const dot = chalk.hex(providerColor)('●');
    const body = [
      '',
      `  ${dot} ${chalk.gray('Provider:')}  ${chalk.hex(providerColor).bold(provider)}`,
      `  ${chalk.gray('Model:    ')}  ${chalk.italic(model)}`,
      '',
      `  ${chalk.white('You can start chatting now.')}`,
      `  ${chalk.gray('Type ')}${chalk.cyan('/help')}${chalk.gray(' for the list of commands.')}`,
      '',
    ].join('\n');
    bigBox({ title: 'CONNECTION SUCCESSFUL', body, color: 'green', icon: '✓' });
  },

  connectionFailed(provider: string, reason: string): void {
    const body = [
      '',
      `  ${chalk.gray('Provider:')}  ${chalk.bold(provider)}`,
      `  ${chalk.gray('Reason:  ')}  ${chalk.red(reason)}`,
      '',
      `  ${chalk.gray('Check your API key and try again.')}`,
      '',
    ].join('\n');
    bigBox({ title: 'CONNECTION FAILED', body, color: 'red', icon: '✗' });
  },

  disconnected(providerName?: string): void {
    const line = providerName
      ? `  ${chalk.gray('Disconnected from ')}${chalk.bold(providerName)}${chalk.gray('.')}`
      : `  ${chalk.gray('All stored API keys have been cleared.')}`;
    const body = [
      '',
      line,
      `  ${chalk.gray('Run ')}${chalk.cyan('gazacode')}${chalk.gray(' to connect again.')}`,
      '',
    ].join('\n');
    bigBox({ title: 'DISCONNECTED', body, color: 'gray', icon: '⏏' });
  },

  providerSwitched(provider: string, model: string, color: string): void {
    const dot = chalk.hex(color)('●');
    const body = [
      '',
      `  ${dot} ${chalk.hex(color).bold(provider)} ${chalk.gray('·')} ${chalk.italic(model)}`,
      `  ${chalk.gray('Your conversation continues with this provider.')}`,
      '',
    ].join('\n');
    bigBox({ title: 'PROVIDER SWITCHED', body, color: 'green', icon: '✓' });
  },

  apiKeySaved(provider: string): void {
    const body = [
      '',
      `  ${chalk.gray('API key for ')}${chalk.bold(provider)}${chalk.gray(' stored securely.')}`,
      `  ${chalk.gray('Location: ')}${chalk.italic('~/.gazacode/config.json')}`,
      '',
    ].join('\n');
    bigBox({ title: 'API KEY SAVED', body, color: 'green', icon: '🔑' });
  },

  apiKeyUpdated(provider: string): void {
    const body = [
      '',
      `  ${chalk.gray('API key for ')}${chalk.bold(provider)}${chalk.gray(' has been updated.')}`,
      `  ${chalk.gray('New key will be used on the next request.')}`,
      '',
    ].join('\n');
    bigBox({ title: 'API KEY UPDATED', body, color: 'green', icon: '🔑' });
  },

  apiKeyRemoved(): void {
    const body = [
      '',
      `  ${chalk.gray('API key removed from local config.')}`,
      `  ${chalk.gray('The provider will ask for a new key next time.')}`,
      '',
    ].join('\n');
    bigBox({ title: 'API KEY REMOVED', body, color: 'gray', icon: '🔑' });
  },

  // ─────────────── Model events ───────────────

  modelChanged(model: string): void {
    const body = [
      '',
      `  ${chalk.gray('Now using ')}${chalk.italic(model)}`,
      '',
    ].join('\n');
    bigBox({ title: 'MODEL UPDATED', body, color: 'green', icon: '✓' });
  },

  // ─────────────── Session events ───────────────

  conversationCleared(): void {
    const body = [
      '',
      `  ${chalk.gray('All messages cleared. Starting a fresh conversation.')}`,
      '',
    ].join('\n');
    bigBox({ title: 'CONVERSATION CLEARED', body, color: 'green', icon: '✓' });
  },

  configReset(): void {
    const body = [
      '',
      `  ${chalk.gray('All settings and API keys erased.')}`,
      `  ${chalk.gray('Run ')}${chalk.cyan('gazacode')}${chalk.gray(' to set things up again.')}`,
      '',
    ].join('\n');
    bigBox({ title: 'GAZACODE RESET', body, color: 'green', icon: '✓' });
  },

  goodbye(): void {
    const body = [
      '',
      `  ${chalk.gray('See you next time!')}`,
      '',
    ].join('\n');
    bigBox({ title: 'GOODBYE', body, color: 'cyan', icon: '👋' });
  },

  // ─────────────── Errors ───────────────

  apiError(provider: string, status: number, details: string): void {
    const body = [
      '',
      `  ${chalk.gray('Provider:')}  ${chalk.bold(provider)}`,
      `  ${chalk.gray('Status:  ')}  ${chalk.red(status)}`,
      `  ${chalk.gray('Details: ')}  ${chalk.gray(details)}`,
      '',
      `  ${chalk.gray('Tip: verify your API key with ')}${chalk.cyan('gazacode config')}${chalk.gray('.')}`,
      '',
    ].join('\n');
    bigBox({ title: 'API ERROR', body, color: 'red', icon: '✗' });
  },

  // ─────────────── Inline status (one-liners) ───────────────

  info(msg: string): void {
    console.log();
    console.log(chalk.cyan('ℹ ') + msg);
  },

  warn(msg: string): void {
    console.log();
    console.log(chalk.yellow('⚠ ') + msg);
  },

  error(msg: string): void {
    console.log();
    console.log(chalk.red('✗ ') + msg);
  },

  success(msg: string): void {
    console.log();
    console.log(chalk.green('✓ ') + msg);
  },

  cancelled(): void {
    console.log();
    console.log(chalk.yellow('⚠ ') + chalk.gray('Cancelled.'));
  },

  // ─────────────── Session status (small badge, no box) ───────────────

  sessionStatus(provider: string, model: string, color: string): void {
    const dot = chalk.hex(color)('●');
    const providerName = chalk.hex(color).bold(provider);
    const m = chalk.italic(model);
    console.log();
    console.log(
      `  ${dot} ${chalk.gray('Connected to')} ${providerName} ${chalk.gray('·')} ${m}`
    );
  },
};
