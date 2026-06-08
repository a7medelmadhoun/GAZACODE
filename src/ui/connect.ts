import chalk from 'chalk';
import boxen from 'boxen';
import inquirer from 'inquirer';
import { listProviders, getProvider } from '../providers/index.js';
import type { ProviderInfo } from '../providers/types.js';
import {
  setApiKey,
  setLastModel,
  set,
  getApiKey,
  getConfigPath,
} from '../config.js';
import { notify } from './messages.js';

export interface ConnectResult {
  providerId: string;
  model: string;
  apiKey: string;
}

export async function runConnectScreen(): Promise<ConnectResult | null> {
  showConnectWelcome();

  const providers = listProviders();

  const providerChoices = providers.map((p) => {
    const hasKey = !!getApiKey(p.info.id);
    const marker = hasKey ? chalk.green('●') : chalk.gray('○');
    const status = hasKey ? chalk.gray(' · ready') : '';
    return {
      name: `${marker} ${chalk.hex(p.info.color).bold(p.info.name.padEnd(18))} ${chalk.gray('· ' + p.info.defaultModel)}${status}`,
      value: p.info.id,
      short: p.info.name,
    };
  });

  const { providerId } = await inquirer.prompt<{ providerId: string }>([
    {
      type: 'list',
      name: 'providerId',
      message: 'Pick a provider to connect:',
      choices: providerChoices,
      pageSize: 10,
      loop: false,
    } as any,
  ]);

  const provider = getProvider(providerId)!;
  let key = getApiKey(providerId);

  if (!key) {
    showApiKeyBox(provider.info);
    const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
      {
        type: 'password',
        name: 'apiKey',
        message: `Paste your ${provider.info.name} API key:`,
        mask: '*',
        validate: (input: string) => input.trim().length > 0 || 'API key cannot be empty',
      },
    ]);
    key = apiKey.trim();
    setApiKey(providerId, key);
    notify.apiKeySaved(provider.info.name);
  }

  set('defaultProvider', providerId);
  setLastModel(providerId, provider.info.defaultModel);

  notify.connectionEstablished(
    provider.info.name,
    provider.info.defaultModel,
    provider.info.color
  );

  return {
    providerId,
    model: provider.info.defaultModel,
    apiKey: key,
  };
}

function showConnectWelcome(): void {
  const lines = [
    chalk.hex('#22c55e').bold('Welcome to GAZACODE'),
    '',
    chalk.white('Connect an AI provider to start chatting in your terminal.'),
    chalk.gray('Your API key is stored locally in ' + getConfigPath()),
    '',
    chalk.gray("Don't have a key? Each provider offers free access:"),
    chalk.gray('  • OpenRouter has 20+ free models (no credit card)'),
    chalk.gray('  • Gemini has a generous free tier'),
    chalk.gray('  • OpenAI / Claude require a paid account'),
  ];

  const box = boxen(lines.join('\n'), {
    padding: 1,
    margin: { top: 1, bottom: 1 },
    borderStyle: 'round',
    borderColor: 'green',
    title: '◉ Connect',
    titleAlignment: 'center',
  });
  console.log(box);
}

function showApiKeyBox(info: ProviderInfo): void {
  const box = boxen(
    [
      chalk.hex(info.color).bold(info.name),
      '',
      chalk.gray('Get an API key at:'),
      chalk.underline.hex('#22c55e')(info.keyUrl),
      '',
      chalk.gray('Format: ') + chalk.white(info.keyHint),
    ].join('\n'),
    {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderStyle: 'round',
      borderColor: 'green',
    }
  );
  console.log(box);
}
