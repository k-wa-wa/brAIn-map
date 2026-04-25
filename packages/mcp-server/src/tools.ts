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
  getCanvasSummary,
  listNodes,
  addNode,
  updateNode,
  deleteNode,
  connectNodes,
  updateEdge,
  deleteEdge,
  groupNodes,
  deleteGroup,
  updateGroup,
  listEdges,
  listGroups,
  getGraphStats,
  clearCanvas,
  getNode,
  searchNodes,
  getNeighbors,
  bulkConnectNodes,
  moveNodesToGroup,
  layoutCanvas,
} from "./db.js";
import { broadcast } from "./sse.js";

const _toolCounts = new Map<string, number>();

export function getToolStats(): Record<string, number> {
  return Object.fromEntries(_toolCounts);
}

export function resetToolStats(): void {
  _toolCounts.clear();
}

function track(name: string) {
  _toolCounts.set(name, (_toolCounts.get(name) ?? 0) + 1);
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function randomPosition() {
  return { x: Math.random() * 800, y: Math.random() * 600 };
}

export function registerTools(server: McpServer) {
  // Wraps registerTool to automatically count each tool invocation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function reg(name: string, config: any, handler: (input: any) => Promise<any>) {
    server.registerTool(name, config, async (input) => {
      track(name);
      return handler(input);
    });
  }

  reg(
    "get_canvas_state",
    {
      description: "Get the FULL state of the canvas including all nodes, edges, and groups. WARNING: returns all data without pagination — only use on small canvases or when you specifically need everything. Prefer get_canvas_summary + list_nodes for large canvases.",
    },
    async () => {
      return ok(getCanvasState());
    }
  );

  reg(
    "get_canvas_summary",
    {
      description: "Get a lightweight summary of the canvas: name, node/edge/group counts, and last updated time. Always call this first to understand the canvas scale before deciding which tools to use next.",
    },
    async () => {
      return ok(getCanvasSummary());
    }
  );

  reg(
    "list_nodes",
    {
      description: "List nodes with pagination. Use limit/offset to page through large canvases. Optionally filter by groupId (pass null to get ungrouped nodes).",
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional().describe("Max nodes to return (default 50)"),
        offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)"),
        groupId: z.string().uuid().nullable().optional().describe("Filter by group ID; null = ungrouped only"),
      },
    },
    async (input) => {
      const result = listNodes({
        ...(input.limit !== undefined && { limit: input.limit }),
        ...(input.offset !== undefined && { offset: input.offset }),
        ...(input.groupId !== undefined && { groupId: input.groupId }),
      });
      return ok({ total: result.total, count: result.nodes.length, nodes: result.nodes });
    }
  );

  reg(
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
      } as any);
      broadcast({ type: "node:added", payload: node });
      return ok(node);
    }
  );

  reg(
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

  reg(
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

  reg(
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
      const edge = connectNodes(parsed as any);
      broadcast({ type: "edge:added", payload: edge });
      return ok(edge);
    }
  );
 
  reg(
    "update_edge",
    {
      description: "Update the label of an existing edge",
      inputSchema: {
        id: z.string().uuid().describe("Edge ID"),
        label: z.string().optional().describe("New label for the edge"),
      }
    },
    async (input) => {
      const edge = updateEdge({ id: input.id, label: input.label });
      if (!edge) return ok({ success: false, error: "Edge not found" });
      broadcast({ type: "edge:updated", payload: edge });
      return ok(edge);
    }
  );

  reg(
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

  reg(
    "group_nodes",
    {
      description: "Create a new named group and place the given nodes into it. To add nodes to an EXISTING group later, use move_nodes_to_group instead.",
      inputSchema: {
        nodeIds: z.array(z.string().uuid()).min(1),
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

  reg(
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

  reg(
    "get_node",
    {
      description: "Get a single node by its ID",
      inputSchema: { id: z.string().uuid().describe("Node ID") },
    },
    async (input) => {
      const node = getNode(input.id);
      if (!node) return ok({ success: false, error: "Node not found" });
      return ok(node);
    }
  );

  reg(
    "search_nodes",
    {
      description: "Search nodes by text content (case-insensitive substring match). Use this to find specific topics, keywords, or concepts on the canvas before creating new nodes to avoid duplicates.",
      inputSchema: {
        query: z.string().min(1).describe("Search query string"),
        limit: z.number().int().min(1).max(100).optional().describe("Max results to return (default 20)"),
      },
    },
    async (input) => {
      const results = searchNodes(input.query, input.limit ?? 20);
      return ok({ count: results.length, nodes: results });
    }
  );

  reg(
    "get_neighbors",
    {
      description: "Get all nodes and edges directly connected to a given node. Useful for exploring local context around a concept.",
      inputSchema: { nodeId: z.string().uuid().describe("The node to explore from") },
    },
    async (input) => {
      const nodeExists = getNode(input.nodeId);
      if (!nodeExists) return ok({ success: false, error: "Node not found" });
      const result = getNeighbors(input.nodeId);
      return ok(result);
    }
  );

  reg(
    "update_group",
    {
      description: "Rename or recolor an existing group",
      inputSchema: {
        id: z.string().uuid().describe("Group ID"),
        name: z.string().min(1).optional(),
        color: NodeColorSchema.optional(),
      },
    },
    async (input) => {
      const group = updateGroup({
        id: input.id,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.color !== undefined && { color: input.color }),
      });
      if (!group) return ok({ success: false, error: "Group not found" });
      broadcast({ type: "group:updated", payload: group });
      return ok(group);
    }
  );

  reg(
    "list_edges",
    {
      description: "List all edges on the canvas with pagination. Use this to understand the connections between nodes.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional().describe("Max edges to return (default 50)"),
        offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)"),
      },
    },
    async (input) => {
      const result = listEdges({
        ...(input.limit !== undefined && { limit: input.limit }),
        ...(input.offset !== undefined && { offset: input.offset }),
      });
      return ok({ total: result.total, count: result.edges.length, edges: result.edges });
    }
  );

  reg(
    "get_graph_stats",
    {
      description: "Get statistics about the knowledge graph: node/edge/group counts, isolated nodes, and the top 10 most connected nodes. Use this to understand the overall shape and density of the brain map.",
    },
    async () => {
      return ok(getGraphStats());
    }
  );

  reg(
    "bulk_add_nodes",
    {
      description: "Add multiple nodes to the canvas in one call. Nodes are auto-positioned in a grid if no position is given. Use this to quickly populate the canvas with many ideas.",
      inputSchema: {
        nodes: z.array(
          z.object({
            text: z.string().min(1),
            type: NodeTypeSchema.optional(),
            color: NodeColorSchema.optional(),
            position: PositionSchema.optional(),
            groupId: z.string().uuid().optional(),
          })
        ).min(1).max(50).describe("List of nodes to create (max 50)"),
      },
    },
    async (input) => {
      const cols = Math.ceil(Math.sqrt(input.nodes.length));
      type NodeInput = { text: string; type?: "sticky" | "text" | "shape"; color?: "yellow"|"blue"|"green"|"red"|"purple"|"orange"|"pink"|"gray"; position?: { x: number; y: number }; groupId?: string };
      const created = (input.nodes as NodeInput[]).map((n, i) => {
        const position = n.position ?? {
          x: (i % cols) * 220 + 80,
          y: Math.floor(i / cols) * 220 + 80,
        };
        const node = addNode({
          text: n.text,
          type: n.type ?? "sticky",
          color: n.color ?? "yellow",
          position,
          ...(n.groupId && { groupId: n.groupId }),
        });
        broadcast({ type: "node:added", payload: node });
        return node;
      });
      return ok({ count: created.length, nodes: created });
    }
  );

  reg(
    "layout_canvas",
    {
      description: `Rearrange all nodes into a clean layout and update their positions on the canvas.
- "radial": organic mind-map layout — groups are placed in angular sectors around a central point, with nodes spread at staggered radii within each sector. Gives a free-form, canvas-like feel. Use this as the default for brain maps.
- "grid": flat square grid across all nodes. Use only when there are no groups or you want a minimal fallback.
- "cluster": each group is a square mini-grid, groups placed side by side horizontally. Good for peer comparisons, but looks rigid.
Always call layout_canvas after grouping to apply the final arrangement.`,
      inputSchema: {
        strategy: z.enum(["grid", "cluster", "radial"]).describe('"radial" = organic sectors (default for brain maps) | "grid" = flat grid | "cluster" = groups side by side'),
      },
    },
    async (input) => {
      const updated = layoutCanvas(input.strategy);
      for (const node of updated) broadcast({ type: "node:updated", payload: node });
      return ok({ count: updated.length, message: `Repositioned ${updated.length} nodes with strategy "${input.strategy}"` });
    }
  );

  reg(
    "clear_canvas",
    {
      description: "Delete ALL nodes, edges, and groups from the canvas. This is irreversible. Use only when explicitly asked to start fresh.",
    },
    async () => {
      const state = clearCanvas();
      broadcast({ type: "canvas:reset", payload: state });
      return ok({ success: true });
    }
  );

  reg(
    "list_groups",
    {
      description: "List all groups on the canvas with their IDs, names, and colors. Always call this before assigning nodes to groups so you know which groups exist.",
    },
    async () => {
      const groups = listGroups();
      return ok({ count: groups.length, groups });
    }
  );

  reg(
    "bulk_connect_nodes",
    {
      description: "Create multiple directional edges in one call. Use this after bulk_add_nodes to wire up a whole graph without making one connect_nodes call per edge.",
      inputSchema: {
        edges: z.array(
          z.object({
            fromNodeId: z.string().uuid(),
            toNodeId: z.string().uuid(),
            label: z.string().optional(),
          })
        ).min(1).max(100).describe("List of edges to create (max 100)"),
      },
    },
    async (input) => {
      const created = bulkConnectNodes(input.edges.map((e: { fromNodeId: string; toNodeId: string; label?: string }) => ({
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        ...(e.label !== undefined && { label: e.label }),
      })));
      for (const edge of created) broadcast({ type: "edge:added", payload: edge });
      return ok({ count: created.length, edges: created });
    }
  );

  reg(
    "move_nodes_to_group",
    {
      description: "Move multiple existing nodes into a group (or ungroup them). Use this to reorganize nodes without recreating them. Pass groupId=null to remove nodes from their current group.",
      inputSchema: {
        groupId: z.string().uuid().nullable().describe("Target group ID, or null to ungroup"),
        nodeIds: z.array(z.string().uuid()).min(1).max(100),
      },
    },
    async (input) => {
      const updated = moveNodesToGroup(input.groupId, input.nodeIds);
      for (const node of updated) broadcast({ type: "node:updated", payload: node });
      return ok({ count: updated.length, nodes: updated });
    }
  );
}
