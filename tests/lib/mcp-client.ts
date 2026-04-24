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

  async callTool(name: string, args: any = {}) {
    return await this.client.callTool({
      name,
      arguments: args,
    });
  }

  async listTools() {
    return await this.client.listTools();
  }
}
