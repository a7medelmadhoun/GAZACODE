export interface MCPTool {
  name: string;
  description: string;
  execute(params: Record<string, unknown>): Promise<unknown>;
}

export interface MCPResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export class MCPRegistry {
  private tools: Map<string, MCPTool> = new Map();

  register(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  list(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  async call(name: string, params: Record<string, unknown>): Promise<MCPResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `MCP tool "${name}" not found.` };
    }
    try {
      const data = await tool.execute(params);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
