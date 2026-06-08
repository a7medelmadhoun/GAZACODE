#!/usr/bin/env node
import chalk from 'chalk';
import boxen from 'boxen';
import inquirer from 'inquirer';
import { showBanner } from './ui/banner.js';
import { notify } from './ui/messages.js';
import { runConnectScreen } from './ui/connect.js';
import {
  getApiKey,
  getLastModel,
  getConfigPath,
  get,
  hasAnyConnection,
  clearAllConnections,
  markNotFirstRun,
  loadSession,
} from './config.js';
import { listProviders, getProvider } from './providers/index.js';
import { ChatSession } from './chat.js';

async function main(): Promise<void> {
  showBanner();

  const cmd = process.argv[2];

  if (cmd === 'config' || cmd === '--config' || cmd === '-c') {
    showConfig();
    return;
  }

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    showHelp();
    return;
  }

  if (cmd === 'reset') {
    await doReset();
    return;
  }

  if (cmd === 'disconnect' || cmd === 'logout') {
    clearAllConnections();
    notify.disconnected();
    return;
  }

  if (cmd === 'connect') {
    if (hasAnyConnection()) {
      notify.info('Already connected. Use /provider in chat to switch.');
    }
    const result = await runConnectScreen();
    if (!result) notify.cancelled();
    return;
  }

  // Try resuming saved session
  const saved = await loadSession();
  if (saved && saved.apiKey) {
    const session = new ChatSession(saved.providerId, saved.model, saved.apiKey);
    session.loadExistingData(saved.messages, saved.workFolder);
    notify.info(`Resumed session from ${new Date(saved.sessionStart).toLocaleString()} · ${saved.messages.filter(m => m.role !== 'system').length} messages`);
    const end = await session.start();
    if (end === 'exit') return;
  }

  // Main app loop: connect → chat → (disconnect → connect →) ...
  let needsConnect = !hasAnyConnection();

  while (true) {
    if (needsConnect) {
      const result = await runConnectScreen();
      if (!result) {
        console.log();
        notify.warn('No provider connected. Exiting GAZACODE.');
        return;
      }
      markNotFirstRun();
      const session = new ChatSession(result.providerId, result.model, result.apiKey);
      const end = await session.start();
      if (end === 'exit') return;
      needsConnect = true;
    } else {
      const providerId = get('defaultProvider');
      const apiKey = getApiKey(providerId);
      if (!apiKey) {
        needsConnect = true;
        continue;
      }
      const provider = getProvider(providerId)!;
      const model = getLastModel(providerId) ?? provider.info.defaultModel;
      const session = new ChatSession(providerId, model, apiKey);
      const end = await session.start();
      if (end === 'exit') return;
      needsConnect = true;
    }
  }
}

function showConfig(): void {
  console.log();
  notify.info(`Config file: ${chalk.underline(getConfigPath())}`);
  const isConnected = hasAnyConnection();
  const status = isConnected
    ? chalk.green('● connected')
    : chalk.gray('○ not connected');
  console.log();
  console.log('  ' + chalk.gray('Status:        ') + status);
  console.log('  ' + chalk.gray('Default:       ') + chalk.bold(get('defaultProvider')));
  const providers = listProviders();
  for (const p of providers) {
    const key = getApiKey(p.info.id);
    const masked = key ? chalk.green('● configured') : chalk.gray('○ not set');
    const lastModel = getLastModel(p.info.id) ?? p.info.defaultModel;
    console.log(
      `  ${chalk.gray(p.info.name.padEnd(16))} ${chalk.hex(p.info.color)('●')} ${masked} · ${chalk.italic(lastModel)}`
    );
  }
  console.log();
}

async function doReset(): Promise<void> {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Erase all API keys and reset GAZACODE?',
      default: false,
    },
  ]);
  if (confirm) {
    clearAllConnections();
    notify.configReset();
  }
}

function showHelp(): void {
  const help = boxen(
    [
      `${chalk.bold('Usage:')} gazacode [command]`,
      '',
      `${chalk.bold('Commands:')}`,
      `  ${chalk.cyan('(none)')}            start the app (connect if needed, then chat)`,
      `  ${chalk.cyan('connect')}           open the connect screen`,
      `  ${chalk.cyan('disconnect')}        clear all stored API keys`,
      `  ${chalk.cyan('config')}            show config and stored providers`,
      `  ${chalk.cyan('reset')}             erase API keys and start over`,
      `  ${chalk.cyan('help')}              show this message`,
      '',
      `${chalk.bold('In-chat commands:')}`,
      `  ${chalk.cyan('/model [name]')}         switch the model for the current provider`,
      `  ${chalk.cyan('/provider')}             switch to a different provider`,
      `  ${chalk.cyan('/keys')}                 manage stored API keys`,
      `  ${chalk.cyan('/retry')}                regenerate the last response`,
      `  ${chalk.cyan('/undo')}                 remove the last exchange`,
      `  ${chalk.cyan('/copy')}                 copy the last response to clipboard`,
      `  ${chalk.cyan('/export [file]')}        save conversation as Markdown`,
      `  ${chalk.cyan('/system [text|reset]')}  view or set the system prompt`,
  `  ${chalk.cyan('/newchat')}              start a fresh conversation`,
  `  ${chalk.cyan('/clear')}                clear the screen and reset conversation`,
  `  ${chalk.cyan('/folder')}               set working folder for file context`,
  `  ${chalk.cyan('/read')}                 load a file into conversation for AI`,
  `  ${chalk.cyan('/search')}               search file contents (regex)`,
  `  ${chalk.cyan('/touch')}                create an empty file`,
  `  ${chalk.cyan('/write')}                write text to a file`,
  `  ${chalk.cyan('/mkdir')}                create a directory`,
  `  ${chalk.cyan('/history')}              show current model and turn counts`,
  `  ${chalk.cyan('/disconnect')}           go back to the connect screen`,
  `  ${chalk.cyan('/help')}                 show in-chat help`,
  `  ${chalk.cyan('/exit')}                 quit GAZACODE`,
    ].join('\n'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
      title: 'OPENGAZA',
      titleAlignment: 'center',
    }
  );
  console.log(help);
}

main().catch((err) => {
  notify.error((err as Error).message);
  process.exit(1);
});
