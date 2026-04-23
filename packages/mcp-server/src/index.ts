import express from "express";
import cors from "cors";
import { existsSync } from "fs";
import { resolve } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  createDb,
  getCanvasState,
  addNode,
  updateNode,
  deleteNode,
  connectNodes,
  deleteEdge,
  groupNodes,
  deleteGroup,
} from "./db.js";
import { addSseClient, broadcast } from "./sse.js";
import { registerTools } from "./tools.js";
import {
  AddNodeInputSchema,
  UpdateNodeInputSchema,
  DeleteGroupInputSchema,
  ConnectNodesInputSchema,
  GroupNodesInputSchema,
} from "@brain-map/shared";

const PORT = process.env["PORT"] ? Number(process.env["PORT"]) : 3000;
const DB_PATH = process.env["DB_PATH"] ?? "./brain-map.db";
const CANVAS_NAME = process.env["CANVAS_NAME"] ?? "My Canvas";
const FRONTEND_DIST = process.env["FRONTEND_DIST"] ?? null;

// Signal to parent process (CLI) that the server is ready
function signalReady() {
  if (process.send) process.send("ready");
}

async function main() {
  await createDb(DB_PATH, CANVAS_NAME);

  const app = express();
  app.use(cors());
  app.use(express.json());

  // --- SSE for GUI live updates ---
  app.get("/sse/canvas", (_req, res) => {
    addSseClient(res);
  });

  // --- REST API for GUI ---
  app.get("/api/canvas", (_req, res) => {
    res.json(getCanvasState());
  });

  app.post("/api/nodes", (req, res) => {
    const parsed = AddNodeInputSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const node = addNode({
      ...parsed.data,
      type: parsed.data.type ?? "sticky",
      color: parsed.data.color ?? "yellow",
      position: parsed.data.position ?? { x: Math.random() * 800, y: Math.random() * 600 },
    });
    broadcast({ type: "node:added", payload: node });
    res.status(201).json(node);
  });

  app.patch("/api/nodes/:id", (req, res) => {
    const parsed = UpdateNodeInputSchema.safeParse({ ...req.body, id: req.params["id"] });
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const node = updateNode(parsed.data);
    if (!node) { res.status(404).json({ error: "Node not found" }); return; }
    broadcast({ type: "node:updated", payload: node });
    res.json(node);
  });

  app.delete("/api/nodes/:id", (req, res) => {
    const id = req.params["id"];
    if (!id) { res.status(400).json({ error: "Missing id" }); return; }
    const deleted = deleteNode(id);
    if (!deleted) { res.status(404).json({ error: "Node not found" }); return; }
    broadcast({ type: "node:deleted", payload: { id } });
    res.status(204).send();
  });

  app.post("/api/edges", (req, res) => {
    const parsed = ConnectNodesInputSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const edge = connectNodes(parsed.data);
    broadcast({ type: "edge:added", payload: edge });
    res.status(201).json(edge);
  });

  app.delete("/api/edges/:id", (req, res) => {
    const id = req.params["id"];
    if (!id) { res.status(400).json({ error: "Missing id" }); return; }
    const deleted = deleteEdge(id);
    if (!deleted) { res.status(404).json({ error: "Edge not found" }); return; }
    broadcast({ type: "edge:deleted", payload: { id } });
    res.status(204).send();
  });

  app.post("/api/groups", (req, res) => {
    const parsed = GroupNodesInputSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const group = groupNodes({ ...parsed.data, color: parsed.data.color ?? "blue" });
    broadcast({ type: "group:added", payload: group });
    res.status(201).json(group);
  });

  app.delete("/api/groups/:id", (req, res) => {
    const parsed = DeleteGroupInputSchema.safeParse({
      id: req.params["id"],
      deleteNodes: req.query["deleteNodes"] === "true",
    });
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const deleted = deleteGroup(parsed.data.id, parsed.data.deleteNodes);
    if (!deleted) { res.status(404).json({ error: "Group not found" }); return; }
    broadcast({ type: "group:deleted", payload: { id: parsed.data.id } });
    res.status(204).send();
  });

  // --- MCP over HTTP/SSE ---
  const mcpTransports: Record<string, SSEServerTransport> = {};

  app.get("/mcp/sse", async (req, res) => {
    const transport = new SSEServerTransport("/mcp/messages", res);
    const mcpServer = new McpServer({ name: "brain-map", version: "0.0.1" });
    registerTools(mcpServer);
    mcpTransports[transport.sessionId] = transport;
    res.on("close", () => delete mcpTransports[transport.sessionId]);
    await mcpServer.connect(transport);
  });

  app.post("/mcp/messages", async (req, res) => {
    const sessionId = req.query["sessionId"] as string;
    const transport = mcpTransports[sessionId];
    if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
    await transport.handlePostMessage(req, res, req.body);
  });

  // --- Serve frontend static files if available ---
  const staticDir = FRONTEND_DIST ?? null;
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get("*splat", (_req, res) => {
      res.sendFile(resolve(staticDir, "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`BRAIN_MAP_READY http://localhost:${PORT}`);
    signalReady();
  });
}

main().catch(console.error);
