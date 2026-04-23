import { Command } from "commander";
import { spawn, type ChildProcess } from "child_process";
import { existsSync, readdirSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FILE_EXT = ".brain-map";
const VITE_PORT = 5173;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveTsxBin(): string {
  const local = resolve(__dirname, "../../../node_modules/.bin/tsx");
  if (existsSync(local)) return local;
  return "tsx";
}

function resolveViteBin(): string {
  const local = resolve(__dirname, "../../../node_modules/.bin/vite");
  if (existsSync(local)) return local;
  return "vite";
}

function resolveServerEntry(): { args: string[] } {
  // Prefer TS source when running from source (development)
  const devPath = resolve(__dirname, "../../mcp-server/src/index.ts");
  if (existsSync(devPath)) return { args: [resolveTsxBin(), devPath] };

  const prodPath = resolve(__dirname, "../../mcp-server/dist/index.js");
  if (existsSync(prodPath)) return { args: ["node", prodPath] };

  throw new Error("Cannot find mcp-server.");
}

function resolveFrontendDist(): string | null {
  const distPath = resolve(__dirname, "../../frontend/dist");
  return existsSync(distPath) ? distPath : null;
}

function resolveFrontendSrc(): string | null {
  const srcPath = resolve(__dirname, "../../frontend");
  return existsSync(resolve(srcPath, "package.json")) ? srcPath : null;
}

function openBrowser(url: string) {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? `open "${url}"` :
    platform === "win32" ? `start "" "${url}"` :
    `xdg-open "${url}"`;
  try {
    execSync(cmd, { stdio: "ignore" });
  } catch {
    // non-fatal
  }
}

function printBanner(canvasUrl: string, mcpUrl: string, dbPath: string, noOpen: boolean) {
  const divider = "─".repeat(52);
  console.log();
  console.log(`  brAIn-map`);
  console.log(`  ${divider}`);
  console.log(`  Canvas    ${canvasUrl}`);
  console.log(`  MCP SSE   ${mcpUrl}`);
  console.log(`  File      ${dbPath}`);
  console.log(`  ${divider}`);
  console.log();
  console.log(`  Add to .claude/settings.json:`);
  console.log();
  console.log(`  {`);
  console.log(`    "mcpServers": {`);
  console.log(`      "brain-map": {`);
  console.log(`        "type": "sse",`);
  console.log(`        "url": "${mcpUrl}"`);
  console.log(`      }`);
  console.log(`    }`);
  console.log(`  }`);
  console.log();
  if (!noOpen) console.log(`  Opening browser...`);
  console.log(`  Press Ctrl+C to stop.`);
  console.log();
}

function spawnViteDev(frontendDir: string, apiPort: number): ChildProcess {
  const vite = resolveViteBin();
  const child = spawn(vite, ["--port", String(VITE_PORT)], {
    cwd: frontendDir,
    env: { ...process.env, VITE_API_PORT: String(apiPort) },
    stdio: "pipe",
  });
  // Suppress vite output — the main banner is enough
  child.stdout?.resume();
  child.stderr?.resume();
  return child;
}

function startServer(opts: {
  dbPath: string;
  canvasName: string;
  port: number;
  noOpen: boolean;
}) {
  const { dbPath, canvasName, port, noOpen } = opts;
  const { args: serverArgs } = resolveServerEntry();
  const frontendDist = resolveFrontendDist();
  const frontendSrc = resolveFrontendSrc();

  // Decide which URL to open
  const useViteDev = !frontendDist && frontendSrc !== null;
  const canvasUrl = `http://localhost:${port}`;
  const mcpUrl = `http://localhost:${port}/mcp/sse`;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    DB_PATH: dbPath,
    CANVAS_NAME: canvasName,
  };
  if (useViteDev) env["VITE_PORT"] = String(VITE_PORT);
  if (frontendDist) env["FRONTEND_DIST"] = frontendDist;

  const server = spawn(serverArgs[0]!, serverArgs.slice(1), {
    env,
    stdio: ["inherit", "pipe", "inherit"],
  });

  let viteChild: ChildProcess | null = null;
  let ready = false;

  server.stdout?.on("data", (chunk: Buffer) => {
    if (!ready && chunk.toString().includes("BRAIN_MAP_READY")) {
      ready = true;

      if (useViteDev && frontendSrc) {
        viteChild = spawnViteDev(frontendSrc, port);
        // Give vite a moment to start before opening browser
        setTimeout(() => {
          printBanner(canvasUrl, mcpUrl, dbPath, noOpen);
          if (!noOpen) openBrowser(canvasUrl);
        }, 2000);
      } else {
        printBanner(canvasUrl, mcpUrl, dbPath, noOpen);
        if (!noOpen) openBrowser(canvasUrl);
      }
    }
  });

  server.on("exit", (code) => {
    viteChild?.kill();
    if (code !== 0 && code !== null) {
      console.error(`Server exited with code ${code}`);
      process.exit(code);
    }
  });

  process.on("SIGINT", () => {
    server.kill("SIGINT");
    viteChild?.kill("SIGINT");
    process.exit(0);
  });
}

const program = new Command();

program
  .name("brain-map")
  .description("AI-powered mind map for engineers")
  .version("0.0.1")
  .argument("[file]", "The .brain-map file to open or create")
  .option("-p, --port <port>", "Port to run on", "3000")
  .option("--no-open", "Skip opening the browser")
  .action((file: string | undefined, opts: { port: string; open: boolean }) => {
    if (!file) {
      console.error("Error: Please specify a file to open or create.");
      console.error("Usage: npx brain-map <filename>");
      console.error("Example: npx brain-map product-brainstorm");
      process.exit(1);
    }

    const slug = slugify(basename(file, FILE_EXT));
    const filename = file.endsWith(FILE_EXT) ? file : `${slug}${FILE_EXT}`;
    const dbPath = resolve(process.cwd(), filename);

    const isNew = !existsSync(dbPath);
    if (isNew) {
      console.log(`Creating: ${basename(dbPath)}`);
    } else {
      console.log(`Opening: ${basename(dbPath)}`);
    }

    const canvasName = basename(dbPath, FILE_EXT).replace(/-/g, " ");
    startServer({ dbPath, canvasName, port: Number(opts.port), noOpen: !opts.open });
  });

program.parse();
