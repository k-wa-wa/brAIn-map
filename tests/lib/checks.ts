import type { CanvasState } from "@brain-map/shared";
import type { StoryAssertions } from "./types.js";

export interface IntegrityResult {
  ok: boolean;
  issues: string[];
}

export function checkIntegrity(canvas: CanvasState): IntegrityResult {
  const nodeIds = new Set(canvas.nodes.map((n) => n.id));
  const groupIds = new Set(canvas.groups.map((g) => g.id));
  const issues: string[] = [];

  for (const e of canvas.edges) {
    if (!nodeIds.has(e.fromNodeId))
      issues.push(`Edge ${e.id.slice(0, 8)} references missing fromNode`);
    if (!nodeIds.has(e.toNodeId))
      issues.push(`Edge ${e.id.slice(0, 8)} references missing toNode`);
  }
  for (const n of canvas.nodes) {
    if (n.groupId !== null && !groupIds.has(n.groupId))
      issues.push(`"${n.text.slice(0, 20)}" references missing group`);
    if (!n.text.trim())
      issues.push(`Node ${n.id.slice(0, 8)} has empty text`);
  }

  return { ok: issues.length === 0, issues };
}

export interface AssertionResult {
  failures: string[];
}

export function checkAssertions(
  canvas: CanvasState,
  assertions: StoryAssertions
): AssertionResult {
  const failures: string[] = [];
  const { nodes, edges, groups } = canvas;

  if (assertions.minNodes !== undefined && nodes.length < assertions.minNodes)
    failures.push(`Expected ≥ ${assertions.minNodes} nodes, got ${nodes.length}`);
  if (assertions.maxNodes !== undefined && nodes.length > assertions.maxNodes)
    failures.push(`Expected ≤ ${assertions.maxNodes} nodes, got ${nodes.length}`);
  if (assertions.minEdges !== undefined && edges.length < assertions.minEdges)
    failures.push(`Expected ≥ ${assertions.minEdges} edges, got ${edges.length}`);
  if (assertions.minGroups !== undefined && groups.length < assertions.minGroups)
    failures.push(`Expected ≥ ${assertions.minGroups} groups, got ${groups.length}`);

  return { failures };
}
