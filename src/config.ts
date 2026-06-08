import { promises as fs } from 'fs';
import Conf from 'conf';
import os from 'os';
import path from 'path';

export interface OpenChatConfig {
  defaultProvider: string;
  apiKeys: Record<string, string>;
  lastModel: Record<string, string>;
  firstRun: boolean;
}

const store = new Conf<OpenChatConfig>({
  projectName: 'opengaza',
  cwd: path.join(os.homedir(), '.opengaza'),
  defaults: {
    defaultProvider: 'openai',
    apiKeys: {},
    lastModel: {},
    firstRun: true,
  },
});

export function getConfigPath(): string {
  return store.path;
}

export function get<K extends keyof OpenChatConfig>(key: K): OpenChatConfig[K] {
  return store.get(key);
}

export function set<K extends keyof OpenChatConfig>(
  key: K,
  value: OpenChatConfig[K]
): void {
  store.set(key, value);
}

export function getApiKey(providerId: string): string | undefined {
  return get('apiKeys')[providerId];
}

export function setApiKey(providerId: string, key: string): void {
  const keys = get('apiKeys');
  keys[providerId] = key;
  set('apiKeys', keys);
}

export function removeApiKey(providerId: string): void {
  const keys = get('apiKeys');
  delete keys[providerId];
  set('apiKeys', keys);
}

export function getLastModel(providerId: string): string | undefined {
  return get('lastModel')[providerId];
}

export function setLastModel(providerId: string, model: string): void {
  const models = get('lastModel');
  models[providerId] = model;
  set('lastModel', models);
}

export function isFirstRun(): boolean {
  return get('firstRun');
}

export function markNotFirstRun(): void {
  set('firstRun', false);
}

export function hasAnyConnection(): boolean {
  return Object.keys(get('apiKeys')).length > 0;
}

export function clearAllConnections(): void {
  set('apiKeys', {});
  set('defaultProvider', 'openai');
  set('lastModel', {});
  set('firstRun', true);
}

// ─────────────── Session persistence ───────────────

const SESSION_FILE = path.join(os.homedir(), '.opengaza', 'session.json');

export interface SavedSession {
  messages: { role: string; content: string }[];
  providerId: string;
  model: string;
  apiKey: string;
  workFolder: string | null;
  sessionStart: string;
}

export async function saveSession(session: SavedSession): Promise<void> {
  const dir = path.dirname(SESSION_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2), 'utf-8');
}

export async function loadSession(): Promise<SavedSession | null> {
  try {
    const raw = await fs.readFile(SESSION_FILE, 'utf-8');
    return JSON.parse(raw) as SavedSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await fs.unlink(SESSION_FILE);
  } catch {}
}
