import chalk from 'chalk';

const BORDER_COLOR = '#2d4a2b';

export class StreamBox {
  private width: number = 0;
  private col = 0;
  private started = false;
  private innerWidth: number = 0;
  private colorize: (s: string) => string;
  private border: (s: string) => string;

  constructor(
    public title: string,
    private color: string,
    private skipTopBorder: boolean = false,
  ) {
    this.colorize = chalk.hex(color);
    this.border = chalk.hex(BORDER_COLOR);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.width = Math.min(process.stdout.columns || 80, 76);
    this.innerWidth = this.width - 4;

    if (!this.skipTopBorder) {
      const dot = chalk.hex(this.color)('●');
      const titleStyled = ` ${dot} ${chalk.hex(this.color).bold(this.title)} `;
      const usedLen = this.title.length + 7;
      const dashes = Math.max(1, this.width - usedLen);
      const top =
        this.border('╭─') + titleStyled + this.border('─'.repeat(dashes) + '╮');

      console.log();
      console.log(top);
    }

    process.stdout.write(this.border('│ '));
    this.col = 0;
  }

  private endLine(): void {
    const padding = this.width - this.col - 2;
    process.stdout.write(' '.repeat(Math.max(0, padding)));
    process.stdout.write(this.border(' │\n│ '));
    this.col = 0;
  }

  write(text: string): void {
    if (!this.started) this.start();

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') {
        this.endLine();
        continue;
      }
      if (this.col >= this.innerWidth) {
        this.endLine();
      }
      process.stdout.write(this.colorize(ch));
      this.col++;
    }
  }

  end(): void {
    if (!this.started) return;
    const padding = this.width - this.col - 2;
    process.stdout.write(' '.repeat(Math.max(0, padding)));
    process.stdout.write(this.border(' │'));
    console.log('\n' + this.border('╰' + '─'.repeat(this.width - 2) + '╯'));
  }
}
