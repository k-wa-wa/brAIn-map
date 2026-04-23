import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AddNodeInputSchema,
  UpdateNodeInputSchema,
  DeleteNodeInputSchema,
  ConnectNodesInputSchema,
  DeleteEdgeInputSchema,
  GroupNodesInputSchema,
  DeleteGroupInputSchema,
  NodeColorSchema,
  NodeTypeSchema,
  PositionSchema,
} from "@brain-map/shared";
import { z } from "zod";
import {
  getCanvasState,
  addNode,
  updateNode,
  deleteNode,
  connectNodes,
  deleteEdge,
  groupNodes,
  deleteGroup,
} from "./db.js";
import { broadcast } from "./sse.js";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function randomPosition() {
  return { x: Math.random() * 800, y: Math.random() * 600 };
}

export function registerTools(server: McpServer) {
  server.registerTool(
    "get_canvas_state",
    { description: "Get the full current state of the canvas" },
    async () => {
      return ok(getCanvasState());
    }
  );

  server.registerTool(
    "add_node",
    {
      description: "Add a new sticky note or text node to the canvas",
      inputSchema: {
        text: z.string().min(1).describe("Content of the node"),
        type: NodeTypeSchema.optional().describe("Node type: sticky | text | shape"),
        color: NodeColorSchema.optional().describe("Color: yellow | blue | green | red | purple | orange | pink | gray"),
        position: PositionSchema.optional().describe("Position {x, y} on canvas"),
        groupId: z.string().uuid().optional().describe("Group ID to assign"),
      }
    },
    async (input) => {
      const parsed = AddNodeInputSchema.parse(input);
      const node = addNode({
        ...parsed,
        type: parsed.type ?? "sticky",
        color: parsed.color ?? "yellow",
        position: parsed.position ?? randomPosition(),
      });
      broadcast({ type: "node:added", payload: node });
      return ok(node);
    }
  );

  server.registerTool(
    "update_node",
    {
      description: "Update text, color, position, or group of an existing node",
      inputSchema: {
        id: z.string().uuid().describe("Node ID"),
        text: z.string().min(1).optional(),
        color: NodeColorSchema.optional(),
        position: PositionSchema.optional(),
        groupId: z.string().uuid().nullable().optional().describe("null to ungroup"),
      }
    },
    async (input) => {
      const parsed = UpdateNodeInputSchema.parse(input);
      const node = updateNode(parsed);
      if (!node) return ok({ success: false, error: "Node not found" });
      broadcast({ type: "node:updated", payload: node });
      return ok(node);
    }
  );

  server.registerTool(
    "delete_node",
    {
      description: "Delete a node and its connected edges",
      inputSchema: { id: z.string().uuid() }
    },
    async (input) => {
      const parsed = DeleteNodeInputSchema.parse(input);
      const deleted = deleteNode(parsed.id);
      if (!deleted) return ok({ success: false, error: "Node not found" });
      broadcast({ type: "node:deleted", payload: { id: parsed.id } });
      return ok({ success: true });
    }
  );

  server.registerTool(
    "connect_nodes",
    {
      description: "Create a directional edge between two nodes",
      inputSchema: {
        fromNodeId: z.string().uuid(),
        toNodeId: z.string().uuid(),
        label: z.string().optional(),
      }
    },
    async (input) => {
      const parsed = ConnectNodesInputSchema.parse(input);
      const edge = connectNodes(parsed);
      broadcast({ type: "edge:added", payload: edge });
      return ok(edge);
    }
  );

  server.registerTool(
    "delete_edge",
    {
      description: "Remove a connection between nodes",
      inputSchema: { id: z.string().uuid() }
    },
    async (input) => {
      const parsed = DeleteEdgeInputSchema.parse(input);
      const deleted = deleteEdge(parsed.id);
      if (!deleted) return ok({ success: false, error: "Edge not found" });
      broadcast({ type: "edge:deleted", payload: { id: parsed.id } });
      return ok({ success: true });
    }
  );

  server.registerTool(
    "group_nodes",
    {
      description: "Cluster multiple nodes into a named group",
      inputSchema: {
        nodeIds: z.array(z.string().uuid()).min(2),
        groupName: z.string().min(1),
        color: NodeColorSchema.optional(),
      }
    },
    async (input) => {
      const parsed = GroupNodesInputSchema.parse(input);
      const group = groupNodes({ ...parsed, color: parsed.color ?? "blue" });
      broadcast({ type: "group:added", payload: group });
      return ok(group);
    }
  );

  server.registerTool(
    "delete_group",
    {
      description: "Delete a group (optionally delete its nodes too)",
      inputSchema: {
        id: z.string().uuid(),
        deleteNodes: z.boolean().optional(),
      }
    },
    async (input) => {
      const parsed = DeleteGroupInputSchema.parse(input);
      const deleted = deleteGroup(parsed.id, parsed.deleteNodes);
      if (!deleted) return ok({ success: false, error: "Group not found" });
      broadcast({ type: "group:deleted", payload: { id: parsed.id } });
      return ok({ success: true });
    }
  );
}
