import initSqlJs, { type Database } from "sql.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import type { CanvasNode, CanvasEdge, CanvasGroup, CanvasState } from "@brain-map/shared";

const CANVAS_ID = "default";
let _db: Database | null = null;
let _dbPath = "./brain-map.db";

function save() {
  if (!_db) return;
  writeFileSync(_dbPath, Buffer.from(_db.export()));
}

export async function createDb(path: string, canvasName = "My Canvas"): Promise<Database> {
  _dbPath = path;
  const SQL = await initSqlJs();

  if (existsSync(path)) {
    _db = new SQL.Database(readFileSync(path));
  } else {
    _db = new SQL.Database();
  }

  _db.run(`
    CREATE TABLE IF NOT EXISTS canvases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      canvas_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'blue',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      canvas_id TEXT NOT NULL,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL DEFAULT 200,
      height REAL NOT NULL DEFAULT 200,
      color TEXT NOT NULL DEFAULT 'yellow',
      group_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      canvas_id TEXT NOT NULL,
      from_node_id TEXT NOT NULL,
      to_node_id TEXT NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const exists = _db.exec("SELECT id FROM canvases WHERE id = ?", [CANVAS_ID]);
  if (exists.length === 0 || exists[0]!.values.length === 0) {
    const now = new Date().toISOString();
    _db.run("INSERT INTO canvases (id, name, updated_at) VALUES (?, ?, ?)", [CANVAS_ID, canvasName, now]);
    save();
  }

  return _db;
}

type Row = Record<string, string | number | null>;

function queryAll(sql: string, params: (string | number | null)[] = []): Row[] {
  if (!_db) throw new Error("DB not initialized");
  const result = _db.exec(sql, params);
  if (result.length === 0) return [];
  const { columns, values } = result[0]!;
  return values.map((row) =>
    Object.fromEntries(columns.map((col: string, i: number) => [col, row[i] as string | number | null]))
  );
}

function queryOne(sql: string, params: (string | number | null)[] = []): Row | null {
  const rows = queryAll(sql, params);
  return rows[0] ?? null;
}

function run(sql: string, params: (string | number | null)[] = []) {
  if (!_db) throw new Error("DB not initialized");
  _db.run(sql, params);
  save();
}

function toNode(row: Row): CanvasNode {
  return {
    id: row["id"] as string,
    type: row["type"] as CanvasNode["type"],
    text: row["text"] as string,
    position: { x: row["x"] as number, y: row["y"] as number },
    width: row["width"] as number,
    height: row["height"] as number,
    color: row["color"] as CanvasNode["color"],
    groupId: (row["group_id"] as string | null) ?? null,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

function toEdge(row: Row): CanvasEdge {
  return {
    id: row["id"] as string,
    fromNodeId: row["from_node_id"] as string,
    toNodeId: row["to_node_id"] as string,
    label: (row["label"] as string | null) ?? null,
    createdAt: row["created_at"] as string,
  };
}

function toGroup(row: Row): CanvasGroup {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    color: row["color"] as CanvasGroup["color"],
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

function touchCanvas() {
  run("UPDATE canvases SET updated_at = ? WHERE id = ?", [new Date().toISOString(), CANVAS_ID]);
}

export function getCanvasSummary(): { name: string; nodeCount: number; edgeCount: number; groupCount: number; updatedAt: string } {
  const canvas = queryOne("SELECT * FROM canvases WHERE id = ?", [CANVAS_ID])!;
  const nodeCount = (queryOne("SELECT COUNT(*) as n FROM nodes WHERE canvas_id = ?", [CANVAS_ID])!["n"] as number);
  const edgeCount = (queryOne("SELECT COUNT(*) as n FROM edges WHERE canvas_id = ?", [CANVAS_ID])!["n"] as number);
  const groupCount = (queryOne("SELECT COUNT(*) as n FROM groups WHERE canvas_id = ?", [CANVAS_ID])!["n"] as number);
  return {
    name: canvas["name"] as string,
    nodeCount,
    edgeCount,
    groupCount,
    updatedAt: canvas["updated_at"] as string,
  };
}

export function listNodes(opts: { limit?: number; offset?: number; groupId?: string | null }): { nodes: CanvasNode[]; total: number } {
  const { limit = 50, offset = 0, groupId } = opts;
  let countSql = "SELECT COUNT(*) as n FROM nodes WHERE canvas_id = ?";
  let listSql  = "SELECT * FROM nodes WHERE canvas_id = ?";
  const params: (string | number | null)[] = [CANVAS_ID];

  if (groupId !== undefined) {
    countSql += " AND group_id IS ?";
    listSql  += " AND group_id IS ?";
    params.push(groupId);
  }

  listSql += " ORDER BY created_at ASC LIMIT ? OFFSET ?";
  const countParams = [...params];
  params.push(limit, offset);

  const total = queryOne(countSql, countParams)!["n"] as number;
  const nodes = queryAll(listSql, params).map(toNode);
  return { nodes, total };
}

export function getNode(id: string): CanvasNode | null {
  const row = queryOne("SELECT * FROM nodes WHERE id = ?", [id]);
  return row ? toNode(row) : null;
}

export function searchNodes(query: string, limit = 20): CanvasNode[] {
  // Case-insensitive substring match across node text
  const pattern = `%${query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  return queryAll(
    "SELECT * FROM nodes WHERE canvas_id = ? AND lower(text) LIKE lower(?) ESCAPE '\\' LIMIT ?",
    [CANVAS_ID, pattern, limit]
  ).map(toNode);
}

export function getNeighbors(nodeId: string): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const edges = queryAll(
    "SELECT * FROM edges WHERE canvas_id = ? AND (from_node_id = ? OR to_node_id = ?)",
    [CANVAS_ID, nodeId, nodeId]
  ).map(toEdge);

  const neighborIds = new Set<string>();
  for (const e of edges) {
    if (e.fromNodeId !== nodeId) neighborIds.add(e.fromNodeId);
    if (e.toNodeId !== nodeId) neighborIds.add(e.toNodeId);
  }

  const nodes: CanvasNode[] = [];
  for (const id of neighborIds) {
    const row = queryOne("SELECT * FROM nodes WHERE id = ?", [id]);
    if (row) nodes.push(toNode(row));
  }

  return { nodes, edges };
}

export function getCanvasState(): CanvasState {
  const canvas = queryOne("SELECT * FROM canvases WHERE id = ?", [CANVAS_ID])!;
  const nodes = queryAll("SELECT * FROM nodes WHERE canvas_id = ?", [CANVAS_ID]).map(toNode);
  const edges = queryAll("SELECT * FROM edges WHERE canvas_id = ?", [CANVAS_ID]).map(toEdge);
  const groups = queryAll("SELECT * FROM groups WHERE canvas_id = ?", [CANVAS_ID]).map(toGroup);
  return {
    id: CANVAS_ID,
    name: canvas["name"] as string,
    nodes,
    edges,
    groups,
    updatedAt: canvas["updated_at"] as string,
  };
}

export function addNode(input: {
  text: string;
  type: CanvasNode["type"];
  color: CanvasNode["color"];
  position: { x: number; y: number };
  groupId?: string | undefined;
}): CanvasNode {
  const now = new Date().toISOString();
  const id = randomUUID();
  run(
    `INSERT INTO nodes (id, canvas_id, type, text, x, y, width, height, color, group_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 200, 200, ?, ?, ?, ?)`,
    [id, CANVAS_ID, input.type, input.text, input.position.x, input.position.y, input.color, input.groupId ?? null, now, now]
  );
  touchCanvas();
  return toNode(queryOne("SELECT * FROM nodes WHERE id = ?", [id])!);
}

export function updateNode(input: {
  id: string;
  text?: string | undefined;
  color?: CanvasNode["color"] | undefined;
  position?: { x: number; y: number } | undefined;
  groupId?: string | null | undefined;
}): CanvasNode | null {
  const existing = queryOne("SELECT * FROM nodes WHERE id = ?", [input.id]);
  if (!existing) return null;
  const now = new Date().toISOString();
  const text = input.text ?? (existing["text"] as string);
  const color = input.color ?? (existing["color"] as string);
  const x = input.position?.x ?? (existing["x"] as number);
  const y = input.position?.y ?? (existing["y"] as number);
  const groupId = input.groupId !== undefined ? input.groupId : (existing["group_id"] as string | null);
  run("UPDATE nodes SET text = ?, color = ?, x = ?, y = ?, group_id = ?, updated_at = ? WHERE id = ?", [
    text, color, x, y, groupId, now, input.id,
  ]);
  touchCanvas();
  return toNode(queryOne("SELECT * FROM nodes WHERE id = ?", [input.id])!);
}

export function deleteNode(id: string): boolean {
  const before = queryOne("SELECT id FROM nodes WHERE id = ?", [id]);
  if (!before) return false;
  run("DELETE FROM edges WHERE from_node_id = ? OR to_node_id = ?", [id, id]);
  run("DELETE FROM nodes WHERE id = ?", [id]);
  touchCanvas();
  return true;
}

export function connectNodes(input: { fromNodeId: string; toNodeId: string; label?: string | undefined }): CanvasEdge {
  const now = new Date().toISOString();
  const id = randomUUID();
  run("INSERT INTO edges (id, canvas_id, from_node_id, to_node_id, label, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    id, CANVAS_ID, input.fromNodeId, input.toNodeId, input.label ?? null, now,
  ]);
  touchCanvas();
  return toEdge(queryOne("SELECT * FROM edges WHERE id = ?", [id])!);
}

export function deleteEdge(id: string): boolean {
  const before = queryOne("SELECT id FROM edges WHERE id = ?", [id]);
  if (!before) return false;
  run("DELETE FROM edges WHERE id = ?", [id]);
  touchCanvas();
  return true;
}

export function updateEdge(input: { id: string; label?: string }): CanvasEdge | null {
  const existing = queryOne("SELECT * FROM edges WHERE id = ?", [input.id]);
  if (!existing) return null;
  const label = input.label !== undefined ? input.label : (existing["label"] as string | null);
  run("UPDATE edges SET label = ? WHERE id = ?", [label, input.id]);
  touchCanvas();
  return toEdge(queryOne("SELECT * FROM edges WHERE id = ?", [input.id])!);
}

export function groupNodes(input: { nodeIds: string[]; groupName: string; color: CanvasGroup["color"] }): CanvasGroup {
  const now = new Date().toISOString();
  const groupId = randomUUID();
  run("INSERT INTO groups (id, canvas_id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [
    groupId, CANVAS_ID, input.groupName, input.color, now, now,
  ]);
  for (const nodeId of input.nodeIds) {
    run("UPDATE nodes SET group_id = ?, updated_at = ? WHERE id = ?", [groupId, now, nodeId]);
  }
  touchCanvas();
  return toGroup(queryOne("SELECT * FROM groups WHERE id = ?", [groupId])!);
}

export function deleteGroup(id: string, deleteNodes: boolean): boolean {
  const before = queryOne("SELECT id FROM groups WHERE id = ?", [id]);
  if (!before) return false;
  if (deleteNodes) {
    const nodes = queryAll("SELECT id FROM nodes WHERE group_id = ?", [id]);
    for (const n of nodes) {
      run("DELETE FROM edges WHERE from_node_id = ? OR to_node_id = ?", [n["id"] as string, n["id"] as string]);
    }
    run("DELETE FROM nodes WHERE group_id = ?", [id]);
  } else {
    run("UPDATE nodes SET group_id = NULL WHERE group_id = ?", [id]);
  }
  run("DELETE FROM groups WHERE id = ?", [id]);
  touchCanvas();
  return true;
}

export function updateGroup(input: { id: string; name?: string; color?: CanvasGroup["color"] }): CanvasGroup | null {
  const existing = queryOne("SELECT * FROM groups WHERE id = ?", [input.id]);
  if (!existing) return null;
  const now = new Date().toISOString();
  const name = input.name ?? (existing["name"] as string);
  const color = input.color ?? (existing["color"] as string);
  run("UPDATE groups SET name = ?, color = ?, updated_at = ? WHERE id = ?", [name, color, now, input.id]);
  touchCanvas();
  return toGroup(queryOne("SELECT * FROM groups WHERE id = ?", [input.id])!);
}

export function listEdges(opts: { limit?: number; offset?: number }): { edges: CanvasEdge[]; total: number } {
  const { limit = 50, offset = 0 } = opts;
  const total = queryOne("SELECT COUNT(*) as n FROM edges WHERE canvas_id = ?", [CANVAS_ID])!["n"] as number;
  const edges = queryAll(
    "SELECT * FROM edges WHERE canvas_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?",
    [CANVAS_ID, limit, offset]
  ).map(toEdge);
  return { edges, total };
}

export function getGraphStats() {
  const nodeCount = queryOne("SELECT COUNT(*) as n FROM nodes WHERE canvas_id = ?", [CANVAS_ID])!["n"] as number;
  const edgeCount = queryOne("SELECT COUNT(*) as n FROM edges WHERE canvas_id = ?", [CANVAS_ID])!["n"] as number;
  const groupCount = queryOne("SELECT COUNT(*) as n FROM groups WHERE canvas_id = ?", [CANVAS_ID])!["n"] as number;

  const nodesWithDegree = queryAll(
    `SELECT n.id, n.text,
       (SELECT COUNT(*) FROM edges WHERE canvas_id = ? AND (from_node_id = n.id OR to_node_id = n.id)) as degree
     FROM nodes n WHERE n.canvas_id = ?
     ORDER BY degree DESC`,
    [CANVAS_ID, CANVAS_ID]
  );

  const isolatedNodeCount = nodesWithDegree.filter((r) => (r["degree"] as number) === 0).length;
  const topConnectedNodes = nodesWithDegree.slice(0, 10).map((r) => ({
    id: r["id"] as string,
    text: (r["text"] as string).substring(0, 60),
    degree: r["degree"] as number,
  }));

  return { nodeCount, edgeCount, groupCount, isolatedNodeCount, topConnectedNodes };
}

export function clearCanvas(): CanvasState {
  run("DELETE FROM edges WHERE canvas_id = ?", [CANVAS_ID]);
  run("DELETE FROM nodes WHERE canvas_id = ?", [CANVAS_ID]);
  run("DELETE FROM groups WHERE canvas_id = ?", [CANVAS_ID]);
  touchCanvas();
  return getCanvasState();
}

export function listGroups(): CanvasGroup[] {
  return queryAll(
    "SELECT * FROM groups WHERE canvas_id = ? ORDER BY created_at ASC",
    [CANVAS_ID]
  ).map(toGroup);
}

export function bulkConnectNodes(
  edges: Array<{ fromNodeId: string; toNodeId: string; label?: string }>
): CanvasEdge[] {
  return edges.map((e) => connectNodes(e));
}

export function moveNodesToGroup(
  groupId: string | null,
  nodeIds: string[]
): CanvasNode[] {
  const now = new Date().toISOString();
  const updated: CanvasNode[] = [];
  for (const id of nodeIds) {
    run(
      "UPDATE nodes SET group_id = ?, updated_at = ? WHERE id = ? AND canvas_id = ?",
      [groupId, now, id, CANVAS_ID]
    );
    const node = getNode(id);
    if (node) updated.push(node);
  }
  if (updated.length > 0) touchCanvas();
  return updated;
}

export function layoutCanvas(strategy: "grid" | "cluster"): CanvasNode[] {
  const nodes = queryAll(
    "SELECT * FROM nodes WHERE canvas_id = ? ORDER BY created_at ASC",
    [CANVAS_ID]
  ).map(toNode);
  if (nodes.length === 0) return [];

  const COL_W = 260;
  const ROW_H = 260;
  const PAD = 100;
  const CLUSTER_GAP = 500;
  const updated: CanvasNode[] = [];

  if (strategy === "grid") {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    for (const [i, node] of nodes.entries()) {
      const x = PAD + (i % cols) * COL_W;
      const y = PAD + Math.floor(i / cols) * ROW_H;
      const result = updateNode({ id: node.id, position: { x, y } });
      if (result) updated.push(result);
    }
  } else {
    // cluster: nodes in the same group are placed together
    const buckets = new Map<string | null, CanvasNode[]>();
    for (const node of nodes) {
      const key = node.groupId ?? null;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(node);
    }

    // ungrouped first, then each named group
    const sections: CanvasNode[][] = [];
    const ungrouped = buckets.get(null);
    if (ungrouped && ungrouped.length > 0) sections.push(ungrouped);
    for (const [key, members] of buckets) {
      if (key !== null) sections.push(members);
    }

    let startX = PAD;
    for (const section of sections) {
      const cols = Math.ceil(Math.sqrt(section.length));
      for (const [i, node] of section.entries()) {
        const x = startX + (i % cols) * COL_W;
        const y = PAD + Math.floor(i / cols) * ROW_H;
        const result = updateNode({ id: node.id, position: { x, y } });
        if (result) updated.push(result);
      }
      startX += cols * COL_W + CLUSTER_GAP;
    }
  }

  return updated;
}
