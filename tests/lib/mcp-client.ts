import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export class McpTestClient {
  private client: Client;
  private transport: SSEClientTransport;

  constructor(private url: string) {
    this.transport = new SSEClientTransport(new URL(this.url));
    this.client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    );
  }

  async connect() {
    await this.client.connect(this.transport);
  }

  async disconnect() {
    await this.client.close();
  }

  async callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
    return await this.client.callTool({
      name,
      arguments: args,
    }) as { content: Array<{ type: "text"; text: string }> };
  }

  async listTools() {
    return await this.client.listTools();
  }
}
