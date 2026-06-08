declare module 'gradient-string' {
  interface Gradient {
    (text: string | string[]): string;
    multiline(text: string | string[]): string;
  }

  const gradients: Record<string, Gradient> & {
    pastel: Gradient;
    rainbow: Gradient;
    summer: Gradient;
    fruit: Gradient;
    vice: Gradient;
    cristal: Gradient;
    morning: Gradient;
    night: Gradient;
    teen: Gradient;
    mind: Gradient;
  };

  export default gradients;
}

declare module 'marked-terminal' {
  import type { MarkedExtension } from 'marked';
  interface Options {
    reflowText?: boolean;
    width?: number;
    showSectionPrefix?: boolean;
    code?: (lang: string, body: string) => string;
    blockquote?: (body: string) => string;
    heading?: (body: string, level: number) => string;
    firstHeading?: (body: string, level: number) => string;
    hr?: () => string;
    listitem?: (body: string, task: boolean, checked: boolean) => string;
    paragraph?: (body: string) => string;
    table?: (header: string, body: string) => string;
    tableSeparator?: () => string;
    codespan?: (code: string) => string;
    strong?: (body: string) => string;
    em?: (body: string) => string;
    del?: (body: string) => string;
    link?: (href: string, title: string | null | undefined, text: string) => string;
    href?: (href: string) => string;
    tab?: number;
    gfm?: boolean;
    emoji?: boolean;
  }
  function markedTerminal(options?: Options): MarkedExtension;
  export { markedTerminal };
}
