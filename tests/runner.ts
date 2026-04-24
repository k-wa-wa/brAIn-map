#!/usr/bin/env tsx
import { writeFileSync, rmSync, appendFileSync, existsSync } from "fs";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline/promises";

import type { Story } from "./lib/types.js";
import { ApiClient } from "./lib/api.js";
import { startServer } from "./lib/server.js";
import {
  section,
  printCanvasState,
  printToolStats,
  printEfficiencyWarnings,
  printChecklist,
} from "./lib/display.js";

// ── story registry ─────────────────────────────────────────────────────────────
async function loadStory(id: string): Promise<Story> {
  const prefix = id.replace(/^(\d+).*/, "$1");
  const loaders: Record<string, () => Promise<{ story: Story }>> = {
    "01": () => import("./stories/01-basic-mapping.js"),
    "02": () => import("./stories/02-graph-building.js"),
    "03": () => import("./stories/03-group-organize.js"),
    "04": () => import("./stories/04-search-update.js"),
    "05": () => import("./stories/05-full-cycle.js"),
  };

  const loader = loaders[prefix];
  if (!loader) {
    const available = Object.keys(loaders).join(", ");
    throw new Error(`Unknown story "${id}". Available: ${available}`);
  }
  return (await loader()).story;
}

// ── run claude ─────────────────────────────────────────────────────────────────
async function runClaude(prompt: string, mcpUrl: string): Promise<void> {
  const ts = Date.now();
  const mcpConfig = join(tmpdir(), `brain-map-mcp-${ts}.json`);
  const promptFile = join(tmpdir(), `brain-map-prompt-${ts}.txt`);
  writeFileSync(mcpConfig, JSON.stringify({
    mcpServers: { "brain-map": { type: "sse", url: mcpUrl } },
  }));
  writeFileSync(promptFile, prompt);

  try {
    await new Promise<void>((resolve, reject) => {
      // Use shell:true so the shell resolves `claude` via PATH (needed on NixOS).
      // Prompt is written to a file to avoid shell-quoting issues with multi-line/Unicode text.
      const cmd = `~/.local/bin/claude --mcp-config ${mcpConfig} --allowedTools "mcp__brain-map__*" -p "$(cat ${promptFile})"`;
      const proc = spawn(cmd, [], { stdio: "inherit", shell: true });
      proc.on("exit", (code) => {
        if (code === 0 || code === null) resolve();
        else reject(new Error(`claude exited with code ${code}`));
      });
      proc.on("error", reject);
    });
  } finally {
    rmSync(mcpConfig, { force: true });
    rmSync(promptFile, { force: true });
  }
}

// ── ask ────────────────────────────────────────────────────────────────────────
async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const storyId = process.argv[2];
  if (!storyId) {
    console.error("Usage: tsx tests/runner.ts <story-id>");
    console.error("       npm run story 01");
    process.exit(1);
  }

  const story = await loadStory(storyId);

  const PORT = Number(process.env["BRAIN_MAP_PORT"] ?? 3001);
  const BASE = `http://localhost:${PORT}`;
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const TEST_DB = resolve(__dirname, ".test-run.brain-map");
  const RESULTS_LOG = resolve(__dirname, "results.log");

  console.log();
  console.log(`  Story: ${story.id} — ${story.name}`);
  console.log(`  ${story.description}`);
  console.log();

  // ── start server ─────────────────────────────────────────────────────────────
  console.log(`  Starting brain-map on port ${PORT}...`);
  const stopServer = await startServer(TEST_DB, PORT);
  process.on("SIGINT", () => { stopServer(); process.exit(0); });

  const api = new ApiClient(BASE);

  // ── seed ──────────────────────────────────────────────────────────────────────
  if (story.seed) {
    console.log("  Applying seed data...");
    await story.seed(api);
    console.log("  Seed applied.");
  }

  // ── reset tool stats ──────────────────────────────────────────────────────────
  await api.resetToolStats();

  // ── pre-state ─────────────────────────────────────────────────────────────────
  section("PRE-STATE");
  const pre = await api.getCanvas();
  printCanvasState(pre);

  // ── run claude ────────────────────────────────────────────────────────────────
  section(`RUNNING STORY ${story.id}: ${story.name}`);
  console.log(`  ${story.prompt}`);
  console.log();

  try {
    await runClaude(story.prompt, `${BASE}/mcp/sse`);
  } catch (e) {
    console.error(`  Claude error: ${String(e)}`);
  }

  // ── post-state ────────────────────────────────────────────────────────────────
  section("POST-STATE");
  const post = await api.getCanvas();
  printCanvasState(post, story.assertions);

  // ── tool stats ────────────────────────────────────────────────────────────────
  section("TOOL CALL STATS");
  const stats = await api.getToolStats();
  printToolStats(stats);
  printEfficiencyWarnings(stats);

  // ── checklist ─────────────────────────────────────────────────────────────────
  section("EVALUATION CHECKLIST");
  printChecklist(story.checklist);
  console.log(`  Open browser at ${BASE} to inspect visually.`);
  console.log();

  // ── verdict ───────────────────────────────────────────────────────────────────
  try {
    const verdict = await ask("Result? [p]ass / [f]ail / [s]kip: ");
    const notes = await ask("Notes (Enter to skip): ");

    const result =
      verdict.startsWith("p") ? "PASS" :
      verdict.startsWith("f") ? "FAIL" : "SKIP";

    const timestamp = new Date().toISOString();
    appendFileSync(RESULTS_LOG, `${timestamp}  ${result}  ${story.id}-${story.name}  ${notes}\n`);

    const colors = { PASS: "\x1b[32m", FAIL: "\x1b[31m", SKIP: "\x1b[33m" };
    console.log(`\n  ${colors[result]}${result}\x1b[0m — logged to results.log\n`);
  } catch (e: any) {
    if (e?.code === "ABORT_ERR") {
      const timestamp = new Date().toISOString();
      appendFileSync(RESULTS_LOG, `${timestamp}  SKIP  ${story.id}-${story.name}  (Ctrl+C)\n`);
      console.log("\n  \x1b[33mSKIP\x1b[0m — aborted with Ctrl+C, logged to results.log\n");
    } else {
      throw e;
    }
  } finally {
    stopServer();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
