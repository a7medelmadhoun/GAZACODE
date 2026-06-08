import chalk from 'chalk';
import inquirer from 'inquirer';
import type { ModelEntry, Provider } from '../providers/types.js';

export function formatCtx(ctx: number | undefined): string {
  if (!ctx) return '';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(ctx % 1_000_000 === 0 ? 0 : 1)}M ctx`;
  if (ctx >= 1_000) return `${Math.round(ctx / 1_000)}K ctx`;
  return `${ctx} ctx`;
}

function modelLabel(m: ModelEntry, isCurrent: boolean): string {
  const marker = isCurrent ? chalk.green('●') : chalk.gray('○');
  const id = isCurrent ? chalk.bold.white(m.id) : m.id;
  const badges: string[] = [];
  if (m.free) badges.push(chalk.green.bold('FREE'));
  if (m.ctx) badges.push(chalk.gray(formatCtx(m.ctx)));
  const badgeText = badges.length ? chalk.gray(' · ' + badges.join(' · ')) : '';
  const desc = m.description ? chalk.italic.gray(' — ' + m.description) : '';
  return `${marker} ${id}${badgeText}${desc}`;
}

export interface PickerResult<T> {
  cancelled: boolean;
  value?: T;
}

export async function pickProvider(
  providers: Provider[],
  currentId: string
): Promise<PickerResult<string>> {
  const choices = providers.map((p) => {
    const isCurrent = p.info.id === currentId;
    const marker = isCurrent ? chalk.green('●') : chalk.gray('○');
    const name = isCurrent ? chalk.bold(p.info.name) : p.info.name;
    const sub = isCurrent ? chalk.gray(` (current · ${p.info.defaultModel})`) : '';
    return {
      name: `${marker} ${chalk.hex(p.info.color)(name)}${sub}`,
      value: p.info.id,
      short: p.info.name,
    };
  });

  try {
    const { id } = await inquirer.prompt<{ id: string }>([
      {
        type: 'list',
        name: 'id',
        message: 'Switch provider:',
        choices,
        pageSize: 12,
        loop: false,
      },
    ]);
    return { cancelled: false, value: id };
  } catch {
    return { cancelled: true };
  }
}

export async function pickModel(
  provider: Provider,
  currentModel: string
): Promise<PickerResult<string>> {
  const free = provider.info.models.filter((m) => m.free);
  const paid = provider.info.models.filter((m) => !m.free);

  const choices: any[] = [];

  if (free.length) {
    choices.push(
      new inquirer.Separator(
        chalk.green.bold('  Free models ') + chalk.gray('— ' + free.length + ' available')
      )
    );
    for (const m of free) {
      choices.push({
        name: modelLabel(m, m.id === currentModel),
        value: m.id,
        short: m.id,
      });
    }
  }

  if (paid.length) {
    choices.push(
      new inquirer.Separator(chalk.gray('  Premium models') + chalk.gray(' — ' + paid.length))
    );
    for (const m of paid) {
      choices.push({
        name: modelLabel(m, m.id === currentModel),
        value: m.id,
        short: m.id,
      });
    }
  }

  try {
    const { modelId } = await inquirer.prompt<{ modelId: string }>([
      {
        type: 'list',
        name: 'modelId',
        message: `Pick a model for ${chalk.hex(provider.info.color).bold(provider.info.name)}:`,
        choices,
        pageSize: 16,
        loop: false,
      } as any,
    ]);
    return { cancelled: false, value: modelId };
  } catch {
    return { cancelled: true };
  }
}
