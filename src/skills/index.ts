import chalk from 'chalk';

export interface Skill {
  name: string;
  description: string;
  execute(args: string[]): Promise<string>;
}

export class SkillManager {
  private skills: Map<string, Skill> = new Map();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  async run(name: string, args: string[]): Promise<string> {
    const skill = this.skills.get(name);
    if (!skill) {
      return chalk.red(`Skill "${name}" not found.`);
    }
    return skill.execute(args);
  }

  formatList(): string {
    const items = this.list();
    if (items.length === 0) return '  No skills registered.';
    return items
      .map((s) => `  ${chalk.cyan(s.name)}  ${chalk.gray(s.description)}`)
      .join('\n');
  }
}
