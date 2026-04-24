import type { CanvasState } from "@brain-map/shared";
import { checkIntegrity, checkAssertions } from "./checks.js";
import type { StoryAssertions } from "./types.js";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

export function hr(): void {
  console.log(`${C.bold}${"─".repeat(60)}${C.reset}`);
}

export function section(title: string): void {
  hr();
  console.log(`${C.bold}[${title}]${C.reset}`);
  console.log();
}

export function printCanvasState(
  canvas: CanvasState,
  assertions?: StoryAssertions
): void {
  const { nodes, edges, groups } = canvas;
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  console.log(`  Nodes : ${C.bold}${nodes.length}${C.reset}`);
  console.log(`  Edges : ${C.bold}${edges.length}${C.reset}`);
  console.log(`  Groups: ${C.bold}${groups.length}${C.reset}`);
  console.log();

  if (groups.length > 0) {
    console.log("  Groups:");
    for (const g of groups) {
      const count = nodes.filter((n) => n.groupId === g.id).length;
      console.log(`    ${C.cyan}[${g.color.padEnd(7)}]${C.reset} ${g.name} (${count} nodes)`);
    }
    console.log();
  }

  if (nodes.length > 0) {
    console.log("  Nodes:");
    for (const n of nodes) {
      const group = n.groupId !== null ? groupMap.get(n.groupId) : undefined;
      const groupLabel = group ? ` ${C.dim}[${group.name}]${C.reset}` : "";
      const text = n.text.length > 50 ? n.text.slice(0, 47) + "…" : n.text;
      console.log(`    ${text}${groupLabel}`);
    }
    console.log();
  }

  if (edges.length > 0) {
    console.log("  Edges:");
    for (const e of edges) {
      const from = nodeMap.get(e.fromNodeId);
      const to = nodeMap.get(e.toNodeId);
      const fromText = from?.text.slice(0, 25) ?? `${C.red}(missing)${C.reset}`;
      const toText = to?.text.slice(0, 25) ?? `${C.red}(missing)${C.reset}`;
      const label = e.label ? ` ${C.dim}[${e.label}]${C.reset}` : "";
      console.log(`    ${fromText} → ${toText}${label}`);
    }
    console.log();
  }

  // Integrity check
  const { ok, issues } = checkIntegrity(canvas);
  if (ok) {
    console.log(`  ${C.green}✓ Structural integrity OK${C.reset}`);
  } else {
    console.log(`  ${C.red}✗ Structural issues:${C.reset}`);
    for (const i of issues) console.log(`    • ${i}`);
  }

  // Assertions
  if (assertions) {
    const { failures } = checkAssertions(canvas, assertions);
    if (failures.length > 0) {
      console.log(`  ${C.red}✗ Assertion failures:${C.reset}`);
      for (const f of failures) console.log(`    • ${f}`);
    } else {
      console.log(`  ${C.green}✓ All assertions passed${C.reset}`);
    }
  }

  // Ungrouped warning
  if (groups.length > 0) {
    const ungrouped = nodes.filter((n) => n.groupId === null).length;
    if (ungrouped > 0) {
      console.log(`  ${C.yellow}! ${ungrouped}/${nodes.length} nodes are ungrouped${C.reset}`);
    }
  }

  console.log();
}

export function printToolStats(stats: Record<string, number>): void {
  const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    console.log("  (no tool calls recorded)");
    console.log();
    return;
  }

  for (const [name, count] of entries) {
    const bar = "█".repeat(Math.min(count, 20));
    console.log(`  ${name.padEnd(26)} ${String(count).padStart(3)}  ${C.cyan}${bar}${C.reset}`);
  }
  console.log();
}

export function printEfficiencyWarnings(stats: Record<string, number>): void {
  const singleNode = stats["add_node"] ?? 0;
  const bulkNode = stats["bulk_add_nodes"] ?? 0;
  const singleEdge = stats["connect_nodes"] ?? 0;
  const bulkEdge = stats["bulk_connect_nodes"] ?? 0;

  if (singleNode > 3 && bulkNode === 0) {
    console.log(
      `  ${C.yellow}! EFFICIENCY: add_node called ${singleNode}x — bulk_add_nodes was never used${C.reset}`
    );
  }
  if (singleEdge > 3 && bulkEdge === 0) {
    console.log(
      `  ${C.yellow}! EFFICIENCY: connect_nodes called ${singleEdge}x — bulk_connect_nodes was never used${C.reset}`
    );
  }
}

export function printChecklist(items: string[]): void {
  for (const [i, item] of items.entries()) {
    console.log(`  ${C.dim}${String(i + 1).padStart(2)}.${C.reset} [ ] ${item}`);
  }
  console.log();
}
