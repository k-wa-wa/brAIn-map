import assert from "node:assert";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { startServer } from "../lib/server.js";
import { McpTestClient } from "../lib/mcp-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = resolve(__dirname, ".mcp-test.brain-map");
const PORT = 3005;
const BASE_URL = `http://localhost:${PORT}`;

async function runTest() {
  console.log("🚀 Starting MCP Integration Test...");

  let stopServer: () => void;
  try {
    stopServer = await startServer(TEST_DB, PORT);
  } catch (e) {
    console.error("Failed to start server:", e);
    process.exit(1);
  }

  const client = new McpTestClient(`${BASE_URL}/mcp/sse`);

  try {
    await client.connect();
    console.log("✅ Connected to MCP server");

    // 1. List tools
    const tools = await client.listTools();
    assert(tools.tools.length > 0, "Should have tools registered");
    console.log(`✅ Found ${tools.tools.length} tools`);

    // 2. Clear canvas
    console.log("🧹 Clearing canvas...");
    await client.callTool("clear_canvas");

    // 3. Add a node
    console.log("📝 Adding a node...");
    const addResult = await client.callTool("add_node", {
      text: "Test Node",
      color: "blue",
      type: "sticky"
    }) as any;
    const node = JSON.parse(addResult.content[0].text);
    assert.strictEqual(node.text, "Test Node");
    assert.strictEqual(node.color, "blue");
    const nodeId = node.id;
    console.log(`✅ Node added with ID: ${nodeId}`);

    // 4. Get canvas state
    console.log("📊 Checking canvas state...");
    const stateResult = await client.callTool("get_canvas_state") as any;
    const state = JSON.parse(stateResult.content[0].text);
    assert.strictEqual(state.nodes.length, 1);
    assert.strictEqual(state.nodes[0].id, nodeId);
    console.log("✅ Canvas state verified");

    // 5. Add another node and connect them
    console.log("🔗 Adding second node and connecting...");
    const addResult2 = await client.callTool("add_node", { text: "Second Node" }) as any;
    const node2 = JSON.parse(addResult2.content[0].text);
    const nodeId2 = node2.id;

    const connectResult = await client.callTool("connect_nodes", {
      fromNodeId: nodeId,
      toNodeId: nodeId2,
      label: "connects to"
    }) as any;
    const edge = JSON.parse(connectResult.content[0].text);
    assert.strictEqual(edge.fromNodeId, nodeId);
    assert.strictEqual(edge.toNodeId, nodeId2);
    assert.strictEqual(edge.label, "connects to");
    console.log("✅ Connection created");

    // 6. Search nodes
    console.log("🔍 Searching for nodes...");
    const searchResult = await client.callTool("search_nodes", { query: "Test" }) as any;
    const search = JSON.parse(searchResult.content[0].text);
    assert.strictEqual(search.count, 1);
    assert.strictEqual(search.nodes[0].text, "Test Node");
    console.log("✅ Search verified");

    console.log("\n🎉 All MCP tests passed!");
  } catch (e) {
    console.error("\n❌ Test failed!");
    console.error(e);
    process.exit(1);
  } finally {
    await client.disconnect();
    stopServer();
  }
}

runTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
