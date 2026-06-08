import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  getApiKey,
  setApiKey,
  removeApiKey,
  getConfigPath,
} from '../config.js';
import { listProviders, getProvider } from '../providers/index.js';
import type { Provider } from '../providers/types.js';
import { notify } from './messages.js';

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••••••••••' + key.slice(-4);
}

function statusLine(p: Provider): string {
  const key = getApiKey(p.info.id);
  const hasKey = !!key;
  const marker = hasKey ? chalk.green('●') : chalk.gray('○');
  const status = hasKey ? chalk.green('configured') : chalk.gray('not set');
  const masked = hasKey ? chalk.gray('(' + maskKey(key!) + ')') : '';
  return `  ${marker} ${chalk.hex(p.info.color).bold(p.info.name.padEnd(18))} ${status} ${masked}`;
}

export async function runKeysManager(args: string[] = []): Promise<void> {
  const subcmd = args[0]?.toLowerCase();

  if (!subcmd || subcmd === 'list') {
    return showKeysList();
  }
  if (subcmd === 'update' || subcmd === 'set') {
    const providerId = args[1];
    if (providerId) {
      const provider = getProvider(providerId);
      if (!provider) {
        notify.warn(`Unknown provider: ${providerId}`);
        return;
      }
      return updateKey(provider);
    }
    return pickAndUpdateKey();
  }
  if (subcmd === 'remove' || subcmd === 'delete' || subcmd === 'rm') {
    return pickAndRemoveKey();
  }
  if (subcmd === 'help' || subcmd === '?') {
    return showKeysHelp();
  }

  notify.warn(`Unknown /keys subcommand: ${subcmd}. Try /keys help.`);
}

function showKeysList(): void {
  console.log();
  console.log(chalk.bold('  Stored API keys'));
  console.log('  ' + chalk.gray('Config: ' + getConfigPath()));
  console.log();
  for (const p of listProviders()) {
    console.log(statusLine(p));
  }
  console.log();
  console.log(
    chalk.gray('  Use ') +
      chalk.cyan('/keys update <provider>') +
      chalk.gray(' to change, ') +
      chalk.cyan('/keys remove') +
      chalk.gray(' to delete.')
  );
  console.log();
}

async function pickAndUpdateKey(): Promise<void> {
  const providers = listProviders();
  const choices = providers.map((p) => ({
    name: statusLine(p).trim(),
    value: p.info.id,
  }));

  const { providerId } = await inquirer.prompt<{ providerId: string }>([
    {
      type: 'list',
      name: 'providerId',
      message: 'Which provider key do you want to update?',
      choices,
      pageSize: 8,
    } as any,
  ]);

  await updateKey(getProvider(providerId)!);
}

async function updateKey(provider: Provider): Promise<void> {
  console.log();
  console.log(chalk.gray('  Get a new key at: ') + chalk.underline.cyan(provider.info.keyUrl));
  console.log(chalk.gray('  Format: ') + chalk.white(provider.info.keyHint));
  console.log();

  const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
    {
      type: 'password',
      name: 'apiKey',
      message: `New ${provider.info.name} API key:`,
      mask: '*',
      validate: (input: string) => input.trim().length > 0 || 'API key cannot be empty',
    },
  ]);

  setApiKey(provider.info.id, apiKey.trim());
  notify.apiKeyUpdated(provider.info.name);
}

async function pickAndRemoveKey(): Promise<void> {
  const providers = listProviders().filter((p) => !!getApiKey(p.info.id));
  if (providers.length === 0) {
    notify.info('No stored keys to remove.');
    return;
  }

  const choices = providers.map((p) => ({
    name: statusLine(p).trim(),
    value: p.info.id,
  }));

  const { providerId } = await inquirer.prompt<{ providerId: string }>([
    {
      type: 'list',
      name: 'providerId',
      message: 'Which provider key do you want to remove?',
      choices,
      pageSize: 8,
    } as any,
  ]);

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Remove the ${providers.find((p) => p.info.id === providerId)!.info.name} API key?`,
      default: false,
    },
  ]);

  if (!confirm) {
    notify.cancelled();
    return;
  }

  removeApiKey(providerId);
  notify.apiKeyRemoved();
}

function showKeysHelp(): void {
  const items: [string, string][] = [
    ['/keys', 'list all stored API keys (masked)'],
    ['/keys update', 'pick a provider and set a new key'],
    ['/keys update <id>', 'update key for a specific provider'],
    ['/keys remove', 'pick a provider and remove its key'],
    ['/keys help', 'show this help'],
  ];
  console.log();
  for (const [cmd, desc] of items) {
    console.log(`  ${chalk.cyan(cmd.padEnd(24))} ${chalk.gray(desc)}`);
  }
  console.log();
}
