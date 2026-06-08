export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

export interface ChatOptions {
  model: string;
  apiKey: string;
  messages: Message[];
  onChunk: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface ModelEntry {
  id: string;
  free?: boolean;
  ctx?: number;
  description?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  emoji: string;
  defaultModel: string;
  models: ModelEntry[];
  keyHint: string;
  keyUrl: string;
  color: string;
}

export interface Provider {
  info: ProviderInfo;
  streamChat(options: ChatOptions): Promise<void>;
}
