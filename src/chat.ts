import readline from 'readline';
import { StringDecoder } from 'string_decoder';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import type { Message } from './providers/types.js';
import type { Provider } from './providers/types.js';
import { notify } from './ui/messages.js';
import { ARROW } from './ui/prompt.js';
import { StreamBox } from './ui/stream-box.js';
import { getAsciiLogo } from './ui/banner.js';
import { copyToClipboard } from './ui/clipboard.js';
import { formatAsMarkdown } from './ui/exporter.js';
import { runKeysManager } from './ui/keys-manager.js';
import {
  setApiKey,
  setLastModel,
  getApiKey as getStoredApiKey,
  getLastModel as getStoredLastModel,
  saveSession,
  clearSession,
} from './config.js';
import { listProviders, getProvider } from './providers/index.js';
import { pickModel, pickProvider } from './ui/picker.js';
import { SkillManager } from './skills/index.js';
import { MCPRegistry } from './mcp/index.js';
import { registerPlaywrightTools } from './mcp/playwright.js';

const SYSTEM_PROMPT = `You are GAZACODE — a coding assistant that can ACTUALLY create and edit files on the user's machine.
You run in a terminal and have real filesystem access.

RULES FOR FILE OPERATIONS (YOU MUST FOLLOW THESE):

1. Any time you write code, create a file, edit a file, or generate any output that should be saved — you MUST use this exact format:

FILE: relative/path/to/file.ext
\`\`\`language
full file content here
\`\`\`

2. The system WILL automatically save the file. You do NOT need to say "I created the file" — the saving happens silently.

3. You can create multiple files in one response by using multiple FILE: blocks.

4. ALWAYS provide the COMPLETE file content, not just a diff or snippet. The code will be auto-saved and will NOT appear in the chat - the user only sees your summary text.

5. CRITICAL: Never show code in your response. FILE: blocks and their code are COMPLETELY HIDDEN from the user. In the chat, ONLY show brief status messages like "✅ Created index.html" or "✅ All files done". NEVER include any code, HTML, CSS, JS, or code fences outside of FILE: blocks. If your response contains any code outside FILE:, it will be REMOVED and the user will see nothing.

6. When the user sets a working folder with /folder, you will receive the full contents of all files in that folder as context. Reference files by their relative path from the working folder.

7. To EDIT an existing file, first read it with the \`/read <filepath>\` command, then rewrite the entire file with FILE:.

8. For COMPLEX REQUESTS (web apps, CLIs, multi-file projects):
   a. In the FIRST response, output a plan BEFORE creating any files: "## Plan\n1. <step>\n2. <step>\n3. <step>" — list 3-6 steps. The plan will appear in the box as ⬜ (pending) checkboxes BEFORE any work starts.
   b. Then in the SAME response, complete the FIRST step. Output "✅ <description>" on its own line BEFORE the FILE: block. The ✅ marks the first item as done in the checklist.
   c. The user will respond with "continue" or similar. In the NEXT response, complete the SECOND step with "✅ <description>" + FILE: block.
   d. Continue until all steps are done.
   e. Example for a website:
      - Response 1: "## Plan\n1. Create index.html\n2. Create style.css\n3. Create script.js\n\n✅ Create index.html" + FILE: index.html
      - User: "continue"
      - Response 2: "✅ Create style.css" + FILE: style.css
      - User: "continue"
      - Response 3: "✅ Create script.js" + FILE: script.js + BROWSER: navigate + BROWSER: screenshot
      - Response 4: "✅ Done" + brief description of what was built (NO code)

9. When ALL steps are complete, output ONLY "✅ Done" or "✅ Done! Built: <brief one-line description>". DO NOT include any code, HTML, CSS, JS, or FILE: blocks. Just a brief 1-2 line summary of what was built. Then test in browser with BROWSER: commands.

10. For WEBSITES: after building all files, test the site in the browser. Use BROWSER: navigate with the file path (e.g., file:///path/to/index.html) or the local server URL. Then take a BROWSER: screenshot to verify it looks correct. If something is broken, fix it with FILE: blocks. After testing, describe what the site does and how it works.

11. Be direct and concise. Do NOT ask the user for confirmation — just build it step by step.

12. You can also control a web browser. Use these commands on their own lines:

   BROWSER: navigate <url>
   BROWSER: click <selector>
   BROWSER: type <selector> <text>
   BROWSER: screenshot
   BROWSER: snapshot

   The browser will execute the commands in order.

   IMPORTANT: Do NOT say anything like "I opened the browser" or "I navigated to" or "Here's the page". Just use the BROWSER: commands silently and continue with your response as if the browser actions happened automatically. The user knows the browser opened — they can see it.

13. REMEMBER: Your ENTIRE response except FILE: blocks and BROWSER: commands will appear in the chat. So NEVER write code, HTML, CSS, or long explanations. Only ✅ status lines and the plan at the start. Keep chat messages to 1-2 lines maximum.`;

export type SessionEnd = 'exit' | 'disconnect';

interface TaskItem {
  id: number;
  text: string;
  done: boolean;
}

export class ChatSession {
  private messages: Message[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  private isPrompting: boolean = false;
  private currentInput: string = '';
  private currentCursor: number = 0;
  private providerId: string;
  private model: string;
  private apiKey: string;
  private currentAbort: AbortController | null = null;
  private provider: Provider;
  private sessionStart: Date = new Date();
  private thinkingMessage: boolean = false;
  private tasks: TaskItem[] = [];

  private skills: SkillManager = new SkillManager();
  private mcp: MCPRegistry = new MCPRegistry();
  private workFolder: string | null = null;

  constructor(providerId: string, model: string, apiKey: string) {
    this.providerId = providerId;
    this.model = model;
    this.apiKey = apiKey;
    this.provider = getProvider(providerId)!;
    registerPlaywrightTools(this.mcp);
    this.registerBuiltinSkills();
  }

  /** Load saved messages and work folder (for session resume) */
  loadExistingData(messages: { role: string; content: string }[], workFolder: string | null): void {
    this.messages = messages as Message[];
    this.workFolder = workFolder;
    // Ensure system prompt is first
    if (!this.messages.some(m => m.role === 'system')) {
      this.messages.unshift({ role: 'system', content: SYSTEM_PROMPT });
    }
    // Rebuild tasks from existing assistant messages
    this.tasks = [];
    for (const m of this.messages) {
      if (m.role === 'assistant') {
        this.parseTasks(m.content);
      }
    }
  }

  /** Extract plan items and ✅ task lines from assistant response */
  private parseTasks(text: string): void {
    const lines = text.split('\n');
    let inPlan = false;
    let foundFirstStep = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect plan section header (## Plan, **Plan**:, Plan:, etc.)
      if (/^(?:#{1,3}\s*plan\b|\*\*plan\*\*|.*\bplan\s*[:：]\s*$)/i.test(trimmed)) {
        inPlan = true;
        continue;
      }

      // Match ✅ completed task
      const doneMatch = trimmed.match(/^✅\s*(.+)/);
      if (doneMatch) {
        const text = doneMatch[1].trim();
        // Find existing task that matches (exact or fuzzy)
        const matchKey = text.toLowerCase().replace(/[^a-z0-9]+/g, '');
        const existing = this.tasks.find(t => {
          if (t.text === text) return true;
          const tKey = t.text.toLowerCase().replace(/[^a-z0-9]+/g, '');
          return tKey === matchKey || tKey.includes(matchKey) || matchKey.includes(tKey);
        });
        if (existing) {
          existing.done = true;
        } else {
          this.tasks.push({ id: this.tasks.length + 1, text, done: true });
        }
        foundFirstStep = true;
        continue;
      }

      // Match numbered step (1. or 1))
      const numMatch = trimmed.match(/^\d+[\.\)]\s+(.+)/);
      if (numMatch && (inPlan || foundFirstStep)) {
        const item = numMatch[1].trim();
        // Strip trailing description (e.g., "1. index.html - structure" → "index.html")
        const title = item.split(/\s+[-—–]\s+/)[0].trim();
        if (title && !this.tasks.some(t => t.text === title)) {
          this.tasks.push({ id: this.tasks.length + 1, text: title, done: false });
        }
        foundFirstStep = true;
        inPlan = false; // After the first step is parsed, plan header context is no longer needed
        continue;
      }
    }
  }

  private registerBuiltinSkills(): void {
    this.skills.register({
      name: 'screenshot',
      description: 'Take a screenshot of a webpage (usage: /run screenshot <url>)',
      execute: async (args) => {
        const url = args[0];
        if (!url) return 'Usage: /run screenshot <url>';
        const result = await this.mcp.call('browser_navigate', { url });
        if (!result.success) return `Failed: ${result.error}`;
        const ss = await this.mcp.call('browser_screenshot', {});
        if (!ss.success) return `Failed: ${ss.error}`;
        return `Navigated to ${url}\nScreenshot: ${ss.data}`;
      },
    });

    this.skills.register({
      name: 'echo',
      description: 'Echo back your message',
      execute: async (args) => `You said: ${args.join(' ')}`,
    });
  }

  async start(): Promise<SessionEnd> {
    this.renderScreen();
    while (true) {
      const input = await this.prompt();
      const trimmed = input.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('/')) {
        const result = await this.handleCommand(trimmed);
        if (result === 'exit') return 'exit';
        if (result === 'disconnect') return 'disconnect';
        continue;
      }

      await this.sendMessage(trimmed);
    }
  }

  private boxWidth(): number {
    return Math.min(process.stdout.columns || 80, 76);
  }

  private boxPad(): string {
    const cols = process.stdout.columns || 80;
    const w = this.boxWidth();
    return ' '.repeat(Math.max(0, Math.floor((cols - w) / 2)));
  }

  /** Wrap Arabic text with bidi controls for proper RTL display */
  private bidiWrap(text: string): string {
    if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) {
      return '\u202b' + text + '\u202c';
    }
    return text;
  }

  private boxLine(width: number, text: string): void {
    const border = chalk.hex('#2d4a2b');
    const innerWidth = width - 4;
    const stripped = text.replace(/\x1B\[[0-9;]*m/g, '');
    const pad = this.boxPad();

    // If it fits, print normally
    if (stripped.length <= innerWidth) {
      const rightPad = Math.max(1, innerWidth - stripped.length);
      process.stdout.write(pad + border('│ ') + text + ' '.repeat(rightPad) + border(' │\n'));
      return;
    }

    // Word-wrap: split the plain text into lines that fit
    const words = stripped.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      if (current.length === 0) {
        current = word;
      } else if (current.length + 1 + word.length <= innerWidth) {
        current += ' ' + word;
      } else {
        lines.push(current);
        current = word;
      }
      // If a single word is longer than innerWidth, force-break it
      while (current.length > innerWidth) {
        lines.push(current.slice(0, innerWidth));
        current = current.slice(innerWidth);
      }
    }
    if (current.length > 0) {
      lines.push(current);
    }

    for (const ln of lines) {
      const rightPad = Math.max(1, innerWidth - ln.length);
      process.stdout.write(pad + border('│ ') + ln + ' '.repeat(rightPad) + border(' │\n'));
    }
  }

  private boxEnd(width: number): void {
    console.log(this.boxPad() + chalk.hex('#2d4a2b')('╰' + '─'.repeat(width - 2) + '╯'));
  }

  private renderScreen(leaveOpen: boolean = false): void {
    console.clear();
    const cols = process.stdout.columns || 80;
    const logo = getAsciiLogo();
    for (const ln of logo.split('\n')) {
      const visible = ln.replace(/\x1B\[[0-9;]*m/g, '');
      const pad = ' '.repeat(Math.max(0, Math.floor((cols - visible.length) / 2)));
      console.log(pad + ln);
    }
    const subtitle = chalk.dim('GAZACODE — A multi-provider AI chat CLI for your terminal — by GAZA');
    const subPad = ' '.repeat(Math.max(0, Math.floor((cols - subtitle.replace(/\x1B\[[0-9;]*m/g, '').length) / 2)));
    console.log(subPad + subtitle);
    console.log();

    const width = this.boxWidth();
    const color = this.provider.info.color;
    const dot = chalk.hex(color)('●');
    const borderChalk = chalk.hex('#2d4a2b');
    const nameTag = chalk.hex(color).bold('GAZACODE');
    const nameLen = nameTag.replace(/\x1B\[[0-9;]*m/g, '').length;
    const namePad = ' '.repeat(Math.max(0, Math.floor((cols - nameLen) / 2)));
    console.log(namePad + nameTag);
    const dashes = Math.max(1, width - '●'.length - 4);
    console.log(this.boxPad() + borderChalk('╭─ ' + dot + ' ' + borderChalk('─'.repeat(dashes) + '╮')));

    if (this.workFolder) {
      this.boxLine(width, chalk.hex('#86efac')('📁 ') + chalk.hex('#86efac').bold(this.workFolder));
      this.boxLine(width, '');
    }
    this.boxLine(width, '');

    const lastUserIdx = this.messages.findLastIndex((m) => m.role === 'user');
    const lastAssistantIdx = this.messages.findLastIndex((m) => m.role === 'assistant');

    if (lastUserIdx === -1) {
      this.boxLine(width, chalk.gray(' Waiting for your first message…'));
    } else {
      const lastUser = this.messages[lastUserIdx];
      this.boxLine(width, chalk.green.bold('You'));
      for (const line of lastUser.content.split('\n')) {
        this.boxLine(width, ` ${this.bidiWrap(line)}`);
      }
      const showLatestAssistant =
        lastAssistantIdx !== -1 && lastAssistantIdx > lastUserIdx;
      if (showLatestAssistant || this.thinkingMessage) {
        this.boxLine(width, '');
        this.boxLine(width, chalk.hex(color).bold('GAZACODE'));
        if (showLatestAssistant) {
          const lastAssistant = this.messages[lastAssistantIdx];
          for (const line of lastAssistant.content.split('\n')) {
            this.boxLine(width, ` ${this.bidiWrap(line)}`);
          }
        }
        if (this.thinkingMessage) {
          this.boxLine(width, ` ${chalk.hex('#22c55e').bold('G')} ${chalk.italic.gray('Thinking')}${chalk.gray('...')}`);
        }
      }
    }

    // Show task checklist
    if (this.tasks.length > 0) {
      this.boxLine(width, '');
      for (const t of this.tasks) {
        const mark = t.done ? chalk.green('✅') : chalk.gray('⬜');
        this.boxLine(width, ` ${mark} ${chalk.gray(t.text)}`);
      }
    }

    if (this.isPrompting) {
      const promptChar = chalk.hex('#22c55e').bold('>');
      const placeholderText = 'Type a message or CLI command...';

      // Horizontal divider
      process.stdout.write(this.boxPad() + borderChalk('├' + '─'.repeat(width - 2) + '┤\n'));

      const line = this.currentInput;
      const innerW = width - 4; // space between │ and │
      const prefixW = 2; // "> "
      const maxTextW = innerW - prefixW;

      let startIdx = 0;
      if (line.length > maxTextW && this.currentCursor >= maxTextW) {
        startIdx = this.currentCursor - maxTextW + 5;
        if (startIdx + maxTextW > line.length) startIdx = line.length - maxTextW;
      }
      if (startIdx < 0) startIdx = 0;

      const visibleText = line.slice(startIdx, startIdx + maxTextW);
      const visibleCursor = this.currentCursor - startIdx;

      // Build the content line: left border, prefix, text, padding (ensures right border stays)
      let contentLine = this.boxPad() + borderChalk('│ ');
      if (line.length === 0) {
        contentLine += promptChar + ' ' + chalk.gray(placeholderText);
        contentLine += ' '.repeat(innerW - prefixW - placeholderText.length);
      } else {
        contentLine += promptChar + ' ' + this.bidiWrap(visibleText);
        contentLine += ' '.repeat(innerW - prefixW - visibleText.length);
      }
      contentLine += borderChalk(' │');
      process.stdout.write(contentLine + '\n');

      // Bottom border
      process.stdout.write(this.boxPad() + borderChalk('╰' + '─'.repeat(width - 2) + '╯'));

      // Position cursor inside the input line (after "> ")
      const col = this.boxPad().length + prefixW + 3 + visibleCursor; // 3 = border(1) + space(1) + ">" prefix space offset
      process.stdout.write(`\u001b[1A\u001b[${col}G`);
    } else {
      this.boxLine(width, '');

      if (!leaveOpen) {
        this.boxEnd(width);
      }
    }
  }

  /** Quickly redraw just the input content line (doesn't touch divider/border) */
  private refreshInputLine(): void {
    const width = this.boxWidth();
    const borderChalk = chalk.hex('#2d4a2b');
    const innerW = width - 4;
    const prefixW = 2;
    const maxTextW = innerW - prefixW;
    const line = this.currentInput;

    // Move cursor to the start of the content line (left border)
    process.stdout.write('\u001b[' + (this.boxPad().length + 1) + 'G');

    // Overwrite the entire content line: left border, prefix, text, padding, right border
    const promptChar = chalk.hex('#22c55e').bold('>');
    let startIdx = 0;
    if (line.length > maxTextW && this.currentCursor >= maxTextW) {
      startIdx = this.currentCursor - maxTextW + 5;
      if (startIdx + maxTextW > line.length) startIdx = line.length - maxTextW;
    }
    if (startIdx < 0) startIdx = 0;

    const visibleText = line.slice(startIdx, startIdx + maxTextW);
    const visibleCursor = this.currentCursor - startIdx;

    let contentLine = borderChalk('│ ');
    if (line.length === 0) {
      contentLine += promptChar + ' ' + chalk.gray('Type a message or CLI command...');
      contentLine += ' '.repeat(innerW - prefixW - 'Type a message or CLI command...'.length);
    } else {
      contentLine += promptChar + ' ' + this.bidiWrap(visibleText);
      contentLine += ' '.repeat(innerW - prefixW - visibleText.length);
    }
    contentLine += borderChalk(' │');
    process.stdout.write(contentLine);

    // Position cursor inside the content line (after "│ > ")
    const col = this.boxPad().length + prefixW + 3 + visibleCursor;
    process.stdout.write(`\u001b[${col}G`);
  }

  private async prompt(): Promise<string> {
    this.isPrompting = true;
    this.currentInput = '';
    this.currentCursor = 0;

    const stdin = process.stdin;
    const stdout = process.stdout;

    // Save old mode and enable raw mode
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    // Full render on first prompt
    this.renderScreen();

    return new Promise((resolve) => {
      let escBuf = '';

      const onData = (buf: Buffer) => {
        // Properly decode UTF-8 (handles multi-byte chars like Arabic)
        const char = buf.toString('utf8');

        // Handle escape sequences (arrows, home, end, delete)
        if (char === '\x1b') {
          escBuf = '\x1b';
          return;
        }
        if (escBuf) {
          escBuf += char;
          if (escBuf === '\x1b[A') { // Up — history placeholder
            escBuf = '';
            return;
          }
          if (escBuf === '\x1b[B') { // Down
            escBuf = '';
            return;
          }
          if (escBuf === '\x1b[C') { // Right
            if (this.currentCursor < this.currentInput.length) {
              this.currentCursor++;
              this.refreshInputLine();
            }
            escBuf = '';
            return;
          }
          if (escBuf === '\x1b[D') { // Left
            if (this.currentCursor > 0) {
              this.currentCursor--;
              this.refreshInputLine();
            }
            escBuf = '';
            return;
          }
          if (escBuf === '\x1b[H' || escBuf === '\x1b[1~') { // Home
            this.currentCursor = 0;
            this.refreshInputLine();
            escBuf = '';
            return;
          }
          if (escBuf === '\x1b[F' || escBuf === '\x1b[4~') { // End
            this.currentCursor = this.currentInput.length;
            this.refreshInputLine();
            escBuf = '';
            return;
          }
          if (escBuf === '\x1b[3~') { // Delete
            if (this.currentCursor < this.currentInput.length) {
              this.currentInput =
                this.currentInput.slice(0, this.currentCursor) +
                this.currentInput.slice(this.currentCursor + 1);
              this.refreshInputLine();
            }
            escBuf = '';
            return;
          }
          escBuf = '';
          return;
        }

        // Enter (handle \r\n on Windows)
        if (char === '\r' || char === '\n' || char === '\r\n') {
          stdin.removeListener('data', onData);
          stdin.pause();
          stdin.setRawMode(wasRaw);
          // Drain any lingering data (\n if \r came alone)
          let leftover = stdin.read();
          while (leftover !== null) leftover = stdin.read();
          this.isPrompting = false;
          stdout.write('\n');
          resolve(this.currentInput);
          return;
        }
        // Ctrl+C
        if (char === '\x03') {
          stdin.setRawMode(wasRaw);
          stdin.pause();
          stdin.removeListener('data', onData);
          this.isPrompting = false;
          stdout.write('^C\n');
          resolve('');
          return;
        }
        // Backspace
        if (char === '\x7f' || char === '\b') {
          if (this.currentCursor > 0) {
            this.currentInput =
              this.currentInput.slice(0, this.currentCursor - 1) +
              this.currentInput.slice(this.currentCursor);
            this.currentCursor--;
          }
          this.refreshInputLine();
          return;
        }
        // Regular character insertion
        this.currentInput =
          this.currentInput.slice(0, this.currentCursor) +
          char +
          this.currentInput.slice(this.currentCursor);
        this.currentCursor++;
        this.refreshInputLine();
      };

      stdin.on('data', onData);
    });
  }

  private async sendMessage(text: string): Promise<void> {
    this.messages.push({ role: 'user', content: text });

    // Show "Thinking..." inside the conversation
    this.thinkingMessage = true;
    this.renderScreen();

    this.currentAbort = new AbortController();

    let fullResponse = '';

    try {
      // Collect full response (no streaming UI to keep rendering clean)
      await this.provider.streamChat({
        model: this.model,
        apiKey: this.apiKey,
        messages: this.messages,
        signal: this.currentAbort.signal,
        onChunk: (chunk) => {
          fullResponse += chunk;
        },
      });
    } catch (err) {
      this.thinkingMessage = false;
      this.messages.pop();
      this.renderScreen();
      if ((err as Error).name === 'AbortError') {
        notify.warn('Generation cancelled.');
      } else {
        notify.apiError(this.provider.info.name, 0, (err as Error).message);
      }
      return;
    }

    this.thinkingMessage = false;

    if (fullResponse) {
      let cleanedResponse = fullResponse
        .replace(/^BROWSER:.*$/gim, '')
        .replace(/^FILE:\s*.+\n```\w*\n[\s\S]*?\n```\s*\n?/gim, '')
        .replace(/(?:^|\n)\s*(?:I(?:\'ve| have)? (?:opened|navigated|gone|visited|launched|started) (?:the browser|to)?|Here(?:'s| is) the|Opening|Let me open|Sure,? (?:I\w+|let me) (?:open|navigate|go|search|look)).*$/gim, '')
        // Remove any remaining code fences that weren't part of FILE: blocks
        .replace(/```[\s\S]*?```\s*\n?/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      // Remove lines that look like raw code
      cleanedResponse = cleanedResponse.split('\n')
        .filter(line => {
          const t = line.trim();
          if (!t) return true;
          // Skip lines starting with common code keywords
          if (/^(const|let|var|function|class|import|export|module|require|def|int|float|char|string|bool|void|return|if|for|while|switch|case|break|continue|try|catch|throw|async|await|yield|from|package|namespace|using|include|#include|<\w+)/.test(t)) return false;
          // Skip lines that look like HTML tags
          if (/^<\/?[a-z][a-z0-9]*\b/.test(t) && /[>]/.test(t)) return false;
          // Skip long lines that look like code (>200 chars)
          if (t.length > 200) return false;
          return true;
        })
        .join('\n')
        .trim();
      this.messages.push({ role: 'assistant', content: cleanedResponse });
      this.parseTasks(cleanedResponse);

      await this.processFileOperations(fullResponse);
      const lastUserMsg = this.messages.findLast(m => m.role === 'user');
      await this.processBrowserOperations(fullResponse, lastUserMsg?.content);
      await this.persistSession();
      this.renderScreen();
    } else {
      notify.warn('No response received.');
      this.renderScreen();
    }
  }

  private async processFileOperations(response: string): Promise<void> {
    const baseDir = this.workFolder || process.cwd();

    const writtenFiles: string[] = [];
    const errors: string[] = [];

    // Step 1: Find all code blocks with their positions and preceding text
    const blockPattern = /```(\w+)?\n([\s\S]*?)```/g;
    interface Block {
      lang: string;
      content: string;
      index: number;
      precedingLine: string;
    }
    const blocks: Block[] = [];
    let bm;
    while ((bm = blockPattern.exec(response)) !== null) {
      const idx = bm.index;
      const beforeNewline = response.lastIndexOf('\n', idx - 2);
      const preceding = response.slice(beforeNewline + 1, idx).trim();
      blocks.push({
        lang: bm[1] || 'txt',
        content: bm[2].trim(),
        index: idx,
        precedingLine: preceding,
      });
    }

    for (const block of blocks) {
      // Determine filename: from FILE: preceding, or auto-generate from language
      const fileMatch = block.precedingLine.match(/^FILE:\s*(.+)$/i);
      const filename = fileMatch ? fileMatch[1].trim() : this.suggestFilename(block.lang);

      const fullPath = path.isAbsolute(filename)
        ? filename
        : path.join(baseDir, filename);
      try {
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, block.content, 'utf-8');
        // Avoid duplicates
        if (!writtenFiles.includes(filename)) {
          writtenFiles.push(filename);
        }
      } catch (err) {
        errors.push(`${filename}: ${(err as Error).message}`);
      }
    }

    if (writtenFiles.length > 0) {
      console.log();
      for (const f of writtenFiles) {
        notify.success(`File saved: ${f}`);
      }
    }
    if (errors.length > 0) {
      for (const e of errors) {
        notify.error(`Failed to save: ${e}`);
      }
    }
  }

  private suggestFilename(lang: string): string {
    const map: Record<string, string> = {
      ts: 'script.ts',
      js: 'script.js',
      tsx: 'component.tsx',
      jsx: 'component.jsx',
      py: 'script.py',
      rs: 'main.rs',
      go: 'main.go',
      rb: 'script.rb',
      java: 'Main.java',
      c: 'main.c',
      cpp: 'main.cpp',
      cs: 'Program.cs',
      php: 'index.php',
      swift: 'main.swift',
      kt: 'main.kt',
      html: 'index.html',
      css: 'styles.css',
      scss: 'styles.scss',
      json: 'data.json',
      xml: 'data.xml',
      yaml: 'config.yaml',
      yml: 'config.yml',
      md: 'README.md',
      sql: 'query.sql',
      sh: 'script.sh',
      bash: 'script.sh',
      dockerfile: 'Dockerfile',
      txt: 'output.txt',
    };
    return map[lang.toLowerCase()] || `output.${lang}`;
  }

  private async persistSession(): Promise<void> {
    await saveSession({
      messages: this.messages,
      providerId: this.providerId,
      model: this.model,
      apiKey: this.apiKey,
      workFolder: this.workFolder,
      sessionStart: this.sessionStart.toISOString(),
    });
  }

  private async processBrowserOperations(response: string, userMessage?: string): Promise<void> {
    const results: string[] = [];
    let executed = false;

    // Phase 1: Parse BROWSER: commands from AI response
    const browserPattern = /^BROWSER:\s*(navigate|click|type|screenshot|snapshot|close)\s*(.*)$/gim;
    let match;
    while ((match = browserPattern.exec(response)) !== null) {
      executed = true;
      const cmd = match[1].toLowerCase();
      const arg = match[2].trim();
      await this.executeBrowserAction(cmd, arg, results);
    }

    // Phase 2: Natural language detection — check user message and AI response
    if (!executed) {
      const combined = [userMessage || '', response].join('\n');

      // Extract URL from user message (e.g., "open google.com", "https://...")
      const urlMatch = combined.match(/(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s]*)?/gi);
      const hasNavigateIntent = /(?:افتح|open|go\s+to|navigate|visit|browse|search\s+(?:for\s+)?|look\s+up|find)/i.test(combined);
      const hasClickIntent = /(?:click|press|اضغط|اختر)/i.test(combined);

      if (hasNavigateIntent && urlMatch) {
        let url = urlMatch[0];
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        await this.executeBrowserAction('navigate', url, results);
        executed = true;
      } else if (hasNavigateIntent && /(?:google|search|بحث)/i.test(combined) && !urlMatch) {
        await this.executeBrowserAction('navigate', 'https://google.com', results);
        executed = true;
      } else if (hasNavigateIntent && !urlMatch) {
        // Default: open google
        await this.executeBrowserAction('navigate', 'https://google.com', results);
        executed = true;
      }
    }

    if (executed && results.length > 0) {
      console.log();
      notify.info('Browser:');
      for (const r of results) {
        console.log('  ' + chalk.gray('• ') + r);
      }
      console.log();
    }
  }

  private async executeBrowserAction(cmd: string, arg: string, results: string[]): Promise<void> {
    switch (cmd) {
      case 'navigate': {
        if (!arg) { results.push('navigate: missing URL'); return; }
        const r = await this.mcp.call('browser_navigate', { url: arg });
        results.push(r.success ? `Navigated to ${arg}` : `navigate: ${r.error}`);
        return;
      }
      case 'click': {
        if (!arg) { results.push('click: missing selector'); return; }
        const r = await this.mcp.call('browser_click', { selector: arg });
        results.push(r.success ? `Clicked ${arg}` : `click: ${r.error}`);
        return;
      }
      case 'type': {
        const spaceIdx = arg.indexOf(' ');
        if (spaceIdx === -1) { results.push('type: missing text'); return; }
        const sel = arg.slice(0, spaceIdx);
        const txt = arg.slice(spaceIdx + 1);
        const r = await this.mcp.call('browser_type', { selector: sel, text: txt });
        results.push(r.success ? `Typed into ${sel}` : `type: ${r.error}`);
        return;
      }
      case 'screenshot': {
        const r = await this.mcp.call('browser_screenshot', {});
        results.push(r.success ? 'Screenshot taken' : `screenshot: ${r.error}`);
        return;
      }
      case 'snapshot': {
        const r = await this.mcp.call('browser_snapshot', {});
        results.push(r.success ? 'Snapshot captured' : `snapshot: ${r.error}`);
        return;
      }
      case 'close': {
        const r = await this.mcp.call('browser_close', {});
        results.push(r.success ? 'Browser closed' : `close: ${r.error}`);
        return;
      }
    }
  }

  private async handleCommand(raw: string): Promise<true | SessionEnd> {
    const [cmd, ...args] = raw.slice(1).split(/\s+/);
    switch (cmd) {
      case 'exit':
      case 'quit':
      case 'q':
        await this.persistSession();
        notify.goodbye();
        return 'exit';

      case 'disconnect':
      case 'logout':
        await this.persistSession();
        notify.disconnected(this.provider.info.name);
        return 'disconnect';

      case 'newchat':
      case 'new':
        this.messages = [{ role: 'system', content: SYSTEM_PROMPT }];
        this.tasks = [];
        await clearSession();
        this.renderScreen();
        notify.info('New conversation started.');
        return true;

      case 'clear':
      case 'cls':
        this.messages = [{ role: 'system', content: SYSTEM_PROMPT }];
        this.tasks = [];
        this.renderScreen();
        return true;

      case 'commands':
      case 'cmds':
        this.showHelp();
        setTimeout(() => {
          this.renderScreen();
        }, 60000);
        return true;

      case 'settings':
      case 'config':
        await this.showSettings();
        return true;

      case 'history':
        this.showHistory();
        return true;

      case 'help':
      case '?':
        this.showHelp();
        return true;

      case 'provider':
      case 'providers':
        await this.showSettings('provider');
        return true;

      case 'model':
      case 'models':
        await this.showSettings('model', args);
        return true;

      case 'keys':
      case 'key':
      case 'apikey':
      case 'apikeys':
        await runKeysManager(args);
        return true;

      case 'retry':
      case 'r':
        await this.retryLast();
        return true;

      case 'copy':
      case 'cp':
        await this.copyLast();
        return true;

      case 'export':
      case 'save':
        await this.exportConversation(args);
        return true;

      case 'system':
      case 'sys':
        await this.systemCommand(args);
        this.renderScreen();
        return true;

      case 'skills':
      case 'sk':
        console.log();
        console.log('  ' + chalk.bold.underline('Available Skills'));
        console.log();
        console.log(this.skills.formatList());
        console.log();
        return true;

      case 'run':
        await this.runSkill(args);
        this.renderScreen();
        return true;

      case 'undo':
      case 'u':
        this.undoLast();
        this.renderScreen();
        return true;

      case 'folder':
        await this.setWorkFolder(args);
        return true;

      case 'touch':
        await this.handleTouchCommand(args);
        this.renderScreen();
        return true;

      case 'read':
        await this.handleReadCommand(args);
        return true;

      case 'search':
      case 'grep':
        await this.handleSearchCommand(args);
        return true;

      case 'write':
        await this.handleWriteCommand(args);
        this.renderScreen();
        return true;

      case 'mkdir':
        await this.handleMkdirCommand(args);
        this.renderScreen();
        return true;

      case 'browser':
      case 'browse':
        await this.handleBrowserCommand(args);
        return true;

      default:
        notify.warn(`Unknown command: /${cmd}. Type /help for the list.`);
        return true;
    }
  }

  private showHistory(): void {
    const userTurns = this.messages.filter((m) => m.role === 'user').length;
    const aiTurns = this.messages.filter((m) => m.role === 'assistant').length;
    const totalChars = this.messages
      .filter((m) => m.role !== 'system')
      .reduce((sum, m) => sum + m.content.length, 0);
    console.log();
    console.log('  ' + chalk.gray('Provider: ') + chalk.hex(this.provider.info.color)(this.provider.info.name));
    console.log('  ' + chalk.gray('Model:    ') + chalk.italic(this.model));
    console.log('  ' + chalk.gray('Turns:    ') + chalk.bold(String(userTurns)) + ' user · ' + chalk.bold(String(aiTurns)) + ' assistant');
    console.log('  ' + chalk.gray('Size:     ') + chalk.bold(String(totalChars)) + ' characters');
    console.log('  ' + chalk.gray('Started:  ') + this.sessionStart.toLocaleString());
    console.log();
  }

  private showHelp(): void {
    const sections: [string, [string, string][]][] = [
      [
        'Chat',
        [
          ['/model [name]', 'switch the model for the current provider'],
          ['/provider', 'switch to a different provider'],
          ['/retry', 'regenerate the last response'],
          ['/undo', 'remove the last exchange from history'],
          ['/newchat', 'start a fresh conversation (keeps provider)'],
          ['/clear', 'clear the screen and reset conversation'],
        ],
      ],
      [
        'Keys & Settings',
        [
          ['/settings', 'open settings page (provider, model, API key)'],
          ['/keys', 'list stored API keys (masked)'],
          ['/keys update', 'change a stored API key'],
          ['/keys remove', 'delete a stored API key'],
          ['/system [text|reset]', 'view or set the system prompt'],
        ],
      ],
      [
        'Output',
        [
          ['/copy', 'copy the last response to clipboard'],
          ['/export [file]', 'save conversation as Markdown'],
          ['/history', 'show current model, turn counts, size'],
        ],
      ],
      [
        'Files',
        [
          ['/folder <path>', 'set working folder for file context'],
          ['/folder', 'set working folder to current directory'],
          ['/read <path>', 'show file content in conversation (AI can see it)'],
          ['/search <pattern>', 'search file contents (regex)'],
          ['/touch <path>', 'create an empty file'],
          ['/write <path> <text>', 'write text to a file'],
          ['/mkdir <path>', 'create a directory'],
        ],
      ],
      [
        'Skills & Browser',
        [
          ['/skills', 'list available skills'],
          ['/run <skill>', 'execute a skill with optional args'],
          ['/browser', 'show browser command usage'],
          ['/browser navigate <url>', 'open a URL in headless browser'],
          ['/browser click <sel>', 'click an element on the page'],
          ['/browser type <sel> <txt>', 'type text into an element'],
        ],
      ],
      [
        'Session',
        [
          ['/commands', 'show all commands (hides after 60s)'],
          ['/disconnect', 'disconnect current provider (back to connect screen)'],
          ['/help', 'show this help'],
          ['/exit', 'quit GAZACODE'],
        ],
      ],
    ];

    console.log();
    for (const [title, items] of sections) {
      console.log('  ' + chalk.bold.underline(title));
      for (const [cmd, desc] of items) {
        console.log(`    ${chalk.cyan(cmd.padEnd(24))} ${chalk.gray(desc)}`);
      }
      console.log();
    }
  }

  // ─────────────── Folder ───────────────

  private async setWorkFolder(args: string[]): Promise<void> {
    const folderPath = args.join(' ').trim();

    // If no path given, default to current working directory
    if (!folderPath) {
      const defaultPath = process.cwd();
      this.workFolder = defaultPath;
      await this.persistSession();
      notify.info(`Working folder set to: ${defaultPath}`);
      await this.injectFolderContext(defaultPath);
      return;
    }

    // Resolve the path
    const resolved = path.resolve(folderPath);

    try {
      const stat = await fs.stat(resolved);
      if (!stat.isDirectory()) {
        notify.warn(`"${resolved}" is not a directory.`);
        return;
      }
    } catch {
      notify.warn(`Folder not found: "${resolved}"`);
      return;
    }

    this.workFolder = resolved;
    notify.info(`Working folder set to: ${resolved}`);
    await this.persistSession();

    // Read all files and inject their contents as context
    await this.injectFolderContext(resolved);
  }

  private async injectFolderContext(folderPath: string): Promise<void> {
    const fileContents: string[] = [];
    const maxFileSize = 50000; // 50KB max per file
    const maxFiles = 50;
    let fileCount = 0;

    const readDir = async (dir: string, prefix: string = ''): Promise<void> => {
      if (fileCount >= maxFiles) return;

      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (fileCount >= maxFiles) break;

        const fullPath = path.join(dir, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        // Skip hidden files/folders and node_modules, dist, .git
        if (entry.name.startsWith('.') || 
            entry.name === 'node_modules' || 
            entry.name === 'dist' || 
            entry.name === 'build' ||
            entry.name === '.git') {
          continue;
        }

        if (entry.isDirectory()) {
          await readDir(fullPath, relativePath);
        } else if (entry.isFile()) {
          try {
            const stat = await fs.stat(fullPath);
            if (stat.size > maxFileSize) {
              fileContents.push(`--- ${relativePath} (skipped: ${(stat.size / 1024).toFixed(1)}KB too large) ---`);
              continue;
            }

            const content = await fs.readFile(fullPath, 'utf-8');
            const ext = path.extname(entry.name).slice(1) || 'txt';
            fileContents.push(`--- ${relativePath} ---\n\`\`\`${ext}\n${content}\n\`\`\``);
            fileCount++;
          } catch {
            // Skip unreadable files
          }
        }
      }
    };

    await readDir(folderPath);

    if (fileContents.length === 0) {
      notify.warn('No readable files found in the folder.');
      return;
    }

    const folderContext = `The user has set the working folder to: ${folderPath}\n` +
      `Below are the contents of ${fileCount} file(s) in this folder:\n\n` +
      fileContents.join('\n\n') +
      `\n\nIMPORTANT — You MUST use this EXACT format when creating or editing files:

FILE: relative/path/from/working/folder.ext
\`\`\`language
complete file content here
\`\`\`

The system will detect this format and AUTO-SAVE the file. Reference all file paths relative to the working folder. Always provide the COMPLETE file content (not diffs or snippets).`;

    // Remove any previous folder context message
    this.messages = this.messages.filter(m => 
      !(m.role === 'system' && m.content.startsWith('The user has set the working folder'))
    );

    // Add as a system message
    this.messages.push({ role: 'system', content: folderContext });

    notify.info(`Loaded ${fileCount} file(s) from ${folderPath}`);
    notify.info('The AI can now create, read, and edit files in this folder.');
    notify.info('Any code block the AI writes will be auto-saved as a file.');
  }

  // ─────────────── File Operations ───────────────

  private async handleTouchCommand(args: string[]): Promise<void> {
    const filePath = args.join(' ').trim();
    if (!filePath) {
      notify.warn('Usage: /touch <filepath>');
      return;
    }
    const base = this.workFolder ?? process.cwd();
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(base, filePath);
    try {
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, '', 'utf-8');
      notify.success(`Created empty file: ${filePath}`);
    } catch (err) {
      notify.error(`Failed to create file: ${(err as Error).message}`);
    }
  }

  private async handleWriteCommand(args: string[]): Promise<void> {
    if (args.length < 2) {
      notify.warn('Usage: /write <filepath> <content>');
      return;
    }
    const filePath = args[0];
    const content = args.slice(1).join(' ');
    const base = this.workFolder ?? process.cwd();
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(base, filePath);
    try {
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      notify.success(`File written: ${filePath} (${content.length} chars)`);
    } catch (err) {
      notify.error(`Failed to write file: ${(err as Error).message}`);
    }
  }

  private async handleMkdirCommand(args: string[]): Promise<void> {
    const dirPath = args.join(' ').trim();
    if (!dirPath) {
      notify.warn('Usage: /mkdir <directory>');
      return;
    }
    const base = this.workFolder ?? process.cwd();
    const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(base, dirPath);
    try {
      await fs.mkdir(fullPath, { recursive: true });
      notify.success(`Directory created: ${dirPath}`);
    } catch (err) {
      notify.error(`Failed to create directory: ${(err as Error).message}`);
    }
  }

  // ─────────────── File reading ───────────────

  private async handleReadCommand(args: string[]): Promise<void> {
    const filePath = args.join(' ').trim();
    if (!filePath) {
      notify.warn('Usage: /read <filepath>');
      return;
    }
    const base = this.workFolder ?? process.cwd();
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(base, filePath);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const relative = path.isAbsolute(filePath) ? filePath : path.relative(process.cwd(), fullPath);
      this.messages.push({
        role: 'system',
        content: `[File content of ${relative}]:\n\`\`\`\n${content}\n\`\`\``,
      });
      notify.success(`Loaded ${relative} (${content.length} chars) — AI can now reference it`);
      this.renderScreen();
    } catch (err) {
      notify.error(`Failed to read file: ${(err as Error).message}`);
    }
  }

  // ─────────────── Search ───────────────

  private async handleSearchCommand(args: string[]): Promise<void> {
    const pattern = args.join(' ').trim();
    if (!pattern) {
      notify.warn('Usage: /search <regex-pattern>');
      return;
    }
    const base = this.workFolder ?? process.cwd();
    try {
      const results: string[] = [];
      const regex = new RegExp(pattern, 'gi');
      await this.searchDir(base, regex, results, base);
      if (results.length === 0) {
        notify.info(`No matches for "${pattern}"`);
      } else {
        console.log();
        for (const line of results.slice(0, 60)) {
          console.log('  ' + line);
        }
        if (results.length > 60) {
          console.log(`  ${chalk.dim(`... and ${results.length - 60} more`)}`);
        }
        console.log();
        // Also inject into conversation so AI can see
        const joined = results.slice(0, 60).join('\n');
        this.messages.push({
          role: 'system',
          content: `[Search results for "${pattern}"]:\n${joined}`,
        });
        notify.success(`Found ${results.length} matches — AI can see the results`);
      }
    } catch (err) {
      notify.error(`Search failed: ${(err as Error).message}`);
    }
  }

  private async searchDir(
    dir: string,
    regex: RegExp,
    results: string[],
    root: string,
  ): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      if (entry.isDirectory()) {
        await this.searchDir(full, regex, results, root);
      } else if (entry.isFile()) {
        try {
          const content = await fs.readFile(full, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              const relative = path.relative(root, full);
              results.push(`${chalk.cyan(relative)}:${i + 1}  ${lines[i].trim().slice(0, 120)}`);
              regex.lastIndex = 0;
            }
          }
        } catch {
          // binary or unreadable — skip
        }
      }
    }
  }

  // ─────────────── Browser ───────────────

  private async handleBrowserCommand(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log();
      console.log('  ' + chalk.bold.underline('Browser commands'));
      console.log();
      console.log('    /browser navigate <url>     ' + chalk.gray('open a URL'));
      console.log('    /browser click <selector>   ' + chalk.gray('click an element'));
      console.log('    /browser type <sel> <text>  ' + chalk.gray('type into an element'));
      console.log('    /browser screenshot         ' + chalk.gray('take a screenshot'));
      console.log('    /browser snapshot           ' + chalk.gray('get page content'));
      console.log('    /browser close              ' + chalk.gray('close the browser'));
      console.log();
      return;
    }

    const action = args[0].toLowerCase();
    const rest = args.slice(1).join(' ');

    let result;
    switch (action) {
      case 'navigate':
        if (!rest) { notify.warn('Usage: /browser navigate <url>'); return; }
        result = await this.mcp.call('browser_navigate', { url: rest });
        break;
      case 'click':
        if (!rest) { notify.warn('Usage: /browser click <selector>'); return; }
        result = await this.mcp.call('browser_click', { selector: rest });
        break;
      case 'type':
        {
          const spaceIdx = rest.indexOf(' ');
          if (spaceIdx === -1) { notify.warn('Usage: /browser type <selector> <text>'); return; }
          result = await this.mcp.call('browser_type', { selector: rest.slice(0, spaceIdx), text: rest.slice(spaceIdx + 1) });
        }
        break;
      case 'screenshot':
        result = await this.mcp.call('browser_screenshot', {});
        break;
      case 'snapshot':
        result = await this.mcp.call('browser_snapshot', {});
        break;
      case 'close':
        result = await this.mcp.call('browser_close', {});
        break;
      default:
        notify.warn(`Unknown browser action: ${action}. Use /browser for help.`);
        return;
    }

    if (result?.success) {
      notify.success(`Browser ${action}: done`);
      if (action === 'screenshot' && typeof result.data === 'string') {
        console.log('  ' + chalk.gray('Data URL: ') + result.data.slice(0, 80) + '…');
      }
    } else {
      notify.error(`Browser ${action}: ${result?.error || 'failed'}`);
    }
  }

  // ─────────────── Settings Page ───────────────

  private async showSettings(tab?: 'provider' | 'model', args?: string[]): Promise<void> {
    // Direct model name shortcut: /model gpt-5.5
    if (tab === 'model' && args && args.length > 0) {
      const direct = args.join(' ').trim();
      if (this.provider.info.models.some((m) => m.id === direct)) {
        this.setModel(direct);
        this.renderScreen();
        return;
      }
      notify.warn(`Model "${direct}" not offered by ${this.provider.info.name}.`);
      // Fall through to settings page
    }
    await this.renderSettingsPage(tab);
  }

  private async renderSettingsPage(openTab?: 'provider' | 'model'): Promise<void> {
    // Quick actions: if a tab is specified, jump directly to the sub-picker
    if (openTab === 'provider') {
      await this.switchProvider();
      // If provider changed, the tab hint for model helps UX
      this.renderScreen();
      return;
    }
    if (openTab === 'model') {
      await this.switchModel([]);
      this.renderScreen();
      return;
    }

    const borderChalk = chalk.hex('#2d4a2b');
    const cols = process.stdout.columns || 80;
    const width = this.boxWidth();
    const color = this.provider.info.color;

    // ── Full page render ──
    console.clear();
    // Logo
    const logo = getAsciiLogo();
    for (const ln of logo.split('\n')) {
      const visible = ln.replace(/\x1B\[[0-9;]*m/g, '');
      const pad = ' '.repeat(Math.max(0, Math.floor((cols - visible.length) / 2)));
      console.log(pad + ln);
    }
    const subtitle = chalk.dim('GAZACODE — Settings');
    const subPad = ' '.repeat(Math.max(0, Math.floor((cols - subtitle.replace(/\x1B\[[0-9;]*m/g, '').length) / 2)));
    console.log(subPad + subtitle);
    console.log();

    // Title line
    const title = chalk.hex(color).bold('SETTINGS');
    const tPad = ' '.repeat(Math.max(0, Math.floor((cols - title.replace(/\x1B\[[0-9;]*m/g, '').length) / 2)));
    console.log(tPad + title);
    const dot = chalk.hex(color)('●');
    const dashes = Math.max(1, width - '●'.length - 4);
    console.log(this.boxPad() + borderChalk('╭─ ' + dot + ' ' + borderChalk('─'.repeat(dashes) + '╮')));

    // Provider
    const provMarker = chalk.hex(this.provider.info.color)('●');
    this.boxLine(width, chalk.bold(' 1. Provider   ') + provMarker + ' ' + chalk.white(this.provider.info.name));
    // Model
    this.boxLine(width, chalk.bold(' 2. Model      ') + chalk.italic.white(this.model));
    // API Key
    const keyDisplay = this.apiKey
      ? chalk.green('● saved') + chalk.gray(' (' + this.apiKey.slice(0, 8) + '…)')
      : chalk.red('○ not set');
    this.boxLine(width, chalk.bold(' 3. API Key    ') + keyDisplay);
    // Work folder
    const folderDisplay = this.workFolder
      ? chalk.hex('#86efac')(this.workFolder)
      : chalk.gray('not set');
    this.boxLine(width, chalk.bold(' 4. Folder     ') + folderDisplay);
    this.boxLine(width, '');
    this.boxLine(width, chalk.gray(' 5. ') + chalk.bold('← Back to Chat'));
    this.boxLine(width, '');

    console.log(this.boxPad() + borderChalk('╰' + '─'.repeat(width - 2) + '╯'));
    console.log();

    // ── Prompt for choice using inquirer ──
    const choices = [
      { name: 'Change provider', value: 'provider' },
      { name: 'Change model', value: 'model' },
      { name: 'Change API key', value: 'apikey' },
      { name: 'Change work folder', value: 'folder' },
      { name: 'Back to Chat', value: 'back' },
    ];

    try {
      const { action } = await inquirer.prompt<{ action: string }>([
        {
          type: 'list',
          name: 'action',
          message: 'Choose a setting to change:',
          choices,
          pageSize: 8,
          loop: false,
        },
      ]);

      switch (action) {
        case 'provider':
          await this.switchProvider();
          await this.renderSettingsPage();
          break;
        case 'model':
          await this.switchModel([]);
          await this.renderSettingsPage();
          break;
        case 'apikey': {
          const newKey = await this.promptKey();
          if (newKey) {
            this.apiKey = newKey;
            setApiKey(this.providerId, newKey);
            notify.apiKeySaved(this.provider.info.name);
          }
          await this.renderSettingsPage();
          break;
        }
        case 'folder':
          await this.setWorkFolder([]);
          await this.renderSettingsPage();
          break;
        case 'back':
          await this.persistSession();
          this.renderScreen();
          break;
      }
    } catch {
      // inquirer cancelled (e.g. Ctrl+C)
      await this.persistSession();
      this.renderScreen();
    }
  }

  private async switchModel(args: string[]): Promise<void> {
    const direct = args.join(' ').trim();
    if (direct) {
      if (this.provider.info.models.some((m) => m.id === direct)) {
        this.setModel(direct);
        return;
      }
      notify.warn(`Model "${direct}" not offered by ${this.provider.info.name}.`);
    }
    const result = await pickModel(this.provider, this.model);
    if (result.cancelled || !result.value) {
      notify.cancelled();
      return;
    }
    this.setModel(result.value);
  }

  private async switchProvider(): Promise<void> {
    const providers = listProviders();
    const result = await pickProvider(providers, this.providerId);
    if (result.cancelled || !result.value) {
      notify.cancelled();
      return;
    }
    const targetId = result.value;
    if (targetId === this.providerId) {
      await this.switchModel([]);
      return;
    }
    await this.activateProvider(targetId);
  }

  private setModel(model: string): void {
    this.model = model;
    setLastModel(this.providerId, model);
    this.persistSession();
    notify.modelChanged(model);
  }

  private async activateProvider(providerId: string): Promise<void> {
    let key = getStoredApiKey(providerId);
    if (!key) {
      const provider = getProvider(providerId)!;
      console.log();
      notify.info(
        `${chalk.hex(provider.info.color).bold(provider.info.name)} needs an API key.`
      );
      notify.info(`Get one at: ${chalk.underline(provider.info.keyUrl)}`);
      notify.info(`Format: ${chalk.gray(provider.info.keyHint)}`);
      key = await this.promptKey();
      if (!key) {
        notify.cancelled();
        return;
      }
      setApiKey(providerId, key);
      notify.apiKeySaved(provider.info.name);
    }
    const provider = getProvider(providerId)!;
    const last = getStoredLastModel(providerId) ?? provider.info.defaultModel;
    this.providerId = providerId;
    this.provider = provider;
    this.apiKey = key;
    this.model = last;
    setLastModel(providerId, this.model);
    await this.persistSession();
    notify.providerSwitched(provider.info.name, this.model, provider.info.color);
  }

  // ─────────────── Retry / Undo ───────────────

  private async retryLast(): Promise<void> {
    const lastUserIdx = this.messages.findLastIndex((m) => m.role === 'user');
    if (lastUserIdx === -1) {
      notify.warn('No message to retry.');
      return;
    }
    const lastUser = this.messages[lastUserIdx];
    this.messages = this.messages.slice(0, lastUserIdx);
    console.log();
    console.log(chalk.gray('  ↻ Retrying last message…'));
    await this.sendMessage(lastUser.content);
  }

  private undoLast(): void {
    const lastAssistantIdx = this.messages.findLastIndex((m) => m.role === 'assistant');
    const lastUserIdx = this.messages.findLastIndex((m) => m.role === 'user');
    if (lastUserIdx === -1) {
      notify.warn('Nothing to undo.');
      return;
    }
    const before = this.messages.length;
    this.messages = this.messages.slice(
      0,
      lastAssistantIdx > lastUserIdx ? lastAssistantIdx : lastUserIdx
    );
    const removed = before - this.messages.length;
    if (removed > 0) {
      notify.info(`Removed last ${removed} message${removed > 1 ? 's' : ''} from history.`);
    }
  }

  // ─────────────── Copy / Export ───────────────

  private async copyLast(): Promise<void> {
    const lastAssistant = [...this.messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) {
      notify.warn('No response to copy yet.');
      return;
    }
    const ok = await copyToClipboard(lastAssistant.content);
    if (ok) {
      const len = lastAssistant.content.length;
      console.log();
      console.log(chalk.green('✓ ') + chalk.bold('Copied last response') + chalk.gray(`  (${len} chars)`));
      console.log();
    } else {
      notify.error('Failed to copy to clipboard. Make sure clip/pbcopy/xclip is available.');
    }
  }

  private async exportConversation(args: string[]): Promise<void> {
    const defaultName = `gazacode-${this.sessionStart.toISOString().slice(0, 10)}.md`;
    const suggested = args[0] || defaultName;

    const { filename } = await inquirer.prompt<{ filename: string }>([
      {
        type: 'input',
        name: 'filename',
        message: 'Export to file:',
        default: suggested,
      },
    ]);

    if (!filename) {
      notify.cancelled();
      return;
    }

    const md = formatAsMarkdown(this.messages, {
      provider: this.provider.info.name,
      model: this.model,
      createdAt: this.sessionStart,
    });

    const target = path.resolve(filename);
    try {
      await fs.writeFile(target, md, 'utf-8');
      const turns = this.messages.filter((m) => m.role !== 'system').length;
      console.log();
      console.log(chalk.green('✓ ') + chalk.bold('Exported conversation'));
      console.log('  ' + chalk.gray('File:   ') + chalk.underline(target));
      console.log('  ' + chalk.gray('Size:   ') + chalk.bold(String(md.length)) + ' chars · ' + chalk.bold(String(turns)) + ' messages');
      console.log();
    } catch (err) {
      notify.error(`Failed to write file: ${(err as Error).message}`);
    }
  }

  // ─────────────── System Prompt ───────────────

  private async systemCommand(args: string[]): Promise<void> {
    const current = this.messages.find((m) => m.role === 'system');

    if (args.length === 0) {
      console.log();
      console.log('  ' + chalk.gray('Current system prompt:'));
      console.log();
      const content = current?.content ?? '(no system prompt)';
      for (const line of content.split('\n')) {
        console.log('  ' + chalk.italic.gray(line));
      }
      console.log();
      console.log('  ' + chalk.gray('Use ') + chalk.cyan('/system <text>') + chalk.gray(' to set a new one,'));
      console.log('  ' + chalk.gray('or ') + chalk.cyan('/system reset') + chalk.gray(' to restore the default.'));
      console.log();
      return;
    }

    const text = args.join(' ').trim();
    if (text === 'reset' || text === 'default') {
      this.messages = this.messages.filter((m) => m.role !== 'system');
      this.messages.unshift({ role: 'system', content: SYSTEM_PROMPT });
      notify.success('System prompt restored to default.');
      return;
    }
    if (text === 'clear' || text === 'none') {
      this.messages = this.messages.filter((m) => m.role !== 'system');
      notify.success('System prompt removed.');
      return;
    }

    this.messages = this.messages.filter((m) => m.role !== 'system');
    this.messages.unshift({ role: 'system', content: text });
    notify.success('System prompt updated.');
  }

  // ─────────────── Skills ───────────────

  private async runSkill(args: string[]): Promise<void> {
    if (args.length === 0) {
      notify.warn('Usage: /run <skill> [args...]. See /skills for available skills.');
      return;
    }
    const name = args[0];
    const skillArgs = args.slice(1);
    console.log();
    console.log('  ' + chalk.gray(`Running skill: ${chalk.cyan(name)} …`));
    console.log();
    const result = await this.skills.run(name, skillArgs);
    console.log(result);
    console.log();
  }

  // ─────────────── Helpers ───────────────

  private async promptKey(): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });
      process.stdout.write(chalk.cyan('? ') + chalk.bold('API key') + ': ');
      (rl as any).stdoutMuted = true;
      (rl as any)._writeToOutput = function (this: any, str: string) {
        if (this.stdoutMuted) this.output.write(str.replace(/[^\r\n]/g, '*'));
        else this.output.write(str);
      };
      rl.once('line', (line) => {
        rl.close();
        process.stdout.write('\n');
        resolve(line.trim());
      });
    });
  }
}
