import figlet from 'figlet';
import gradient from 'gradient-string';
import boxen from 'boxen';
import chalk from 'chalk';

const OPENCHAT_FONT = 'ANSI Shadow';

export function getAsciiLogo(): string {
  const title = figlet.textSync('GAZACODE', { font: OPENCHAT_FONT });
  // Green gradient matching the GAZACODE theme
  const greenGradient = (gradient as any)('#22c55e', '#16a34a', '#15803d');
  return greenGradient.multiline(title);
}

export function showBanner(): void {
  console.log(getAsciiLogo());

  const tagline = chalk.dim('A multi-provider AI chat CLI for your terminal — by GAZA');
  const line = chalk.gray('─'.repeat(60));
  console.log(tagline);
  console.log(line);
}

export function showBox(
  title: string,
  body: string,
  color: 'green' | 'cyan' | 'yellow' | 'magenta' | 'red' | 'gray' = 'cyan'
): void {
  const box = boxen(body, {
    title,
    titleAlignment: 'center',
    padding: 1,
    margin: { top: 1, bottom: 1 },
    borderStyle: 'round',
    borderColor: color,
  });
  console.log(box);
}

export function showProviderBanner(providerName: string, model: string, color: string): void {
  const label = chalk.hex(color).bold(` ${providerName} `);
  const modelText = chalk.white(`  ${model} `);
  console.log('\n' + label + chalk.bgGray(modelText) + '\n');
}
