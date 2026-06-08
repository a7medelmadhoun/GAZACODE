import chalk from 'chalk';
import readline from 'readline';

export function clearLine(): void {
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
}

const ARROW = chalk.cyan.bold('›');
const AI = chalk.magenta.bold('AI');
const YOU = chalk.green.bold('You');

export function printUser(text: string): void {
  console.log(`\n${YOU} ${chalk.gray('─'.repeat(2))} ${chalk.white(text)}`);
}

export function printAiHeader(color: string): void {
  const label = chalk.hex(color).bold(' AI ');
  console.log(`\n${label} ${chalk.gray('─'.repeat(2))}`);
}

export function printDivider(): void {
  console.log(chalk.gray('─'.repeat(60)));
}

export function printArrow(): void {
  process.stdout.write(ARROW + ' ');
}

export function printInfo(text: string): void {
  console.log(chalk.cyan('ℹ ') + text);
}

export function printSuccess(text: string): void {
  console.log(chalk.green('✓ ') + text);
}

export function printWarn(text: string): void {
  console.log(chalk.yellow('⚠ ') + text);
}

export function printError(text: string): void {
  console.log(chalk.red('✗ ') + text);
}

export { ARROW, AI, YOU };
