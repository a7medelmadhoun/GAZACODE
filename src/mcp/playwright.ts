import { chromium, type Browser, type Page } from 'playwright';
import { MCPRegistry, type MCPTool } from './index.js';

let browser: Browser | null = null;
let page: Page | null = null;

async function getPage(): Promise<Page> {
  if (!browser) {
    browser = await chromium.launch({ headless: false, channel: 'chrome' });
  }
  if (!page) {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
  }
  return page;
}

export function registerPlaywrightTools(registry: MCPRegistry): void {
  const navigate: MCPTool = {
    name: 'browser_navigate',
    description: 'Navigate to a URL',
    async execute(params) {
      const p = await getPage();
      await p.goto(params.url as string, { waitUntil: 'networkidle' });
      return { title: await p.title(), url: p.url() };
    },
  };

  const snapshot: MCPTool = {
    name: 'browser_snapshot',
    description: 'Get the current page content as text',
    async execute() {
      const p = await getPage();
      return p.content();
    },
  };

  const screenshot: MCPTool = {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page',
    async execute() {
      const p = await getPage();
      const buffer = await p.screenshot({ type: 'png' });
      return `data:image/png;base64,${buffer.toString('base64')}`;
    },
  };

  const click: MCPTool = {
    name: 'browser_click',
    description: 'Click an element by selector',
    async execute(params) {
      const p = await getPage();
      await p.click(params.selector as string);
      return true;
    },
  };

  const type: MCPTool = {
    name: 'browser_type',
    description: 'Type text into an element',
    async execute(params) {
      const p = await getPage();
      await p.fill(params.selector as string, params.text as string);
      return true;
    },
  };

  const close: MCPTool = {
    name: 'browser_close',
    description: 'Close the browser',
    async execute() {
      if (browser) await browser.close();
      browser = null;
      page = null;
      return true;
    },
  };

  for (const tool of [navigate, snapshot, screenshot, click, type, close]) {
    registry.register(tool);
  }
}
