import { spawn } from "child_process";
import { rmSync, existsSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CLI_BIN = resolve(ROOT, "packages/cli/bin/brain-map.js");

function killOnPort(port: number): void {
  try {
    const pids = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" }).trim();
    if (pids) execSync(`kill -9 ${pids}`, { stdio: "ignore" });
  } catch {
    // port was not in use
  }
}

async function waitForAlive(baseUrl: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/canvas`);
      if (res.ok) return;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server at ${baseUrl} didn't respond within ${timeoutMs}ms`);
}

export async function startServer(
  dbPath: string,
  port: number
): Promise<() => void> {
  if (existsSync(dbPath)) rmSync(dbPath);

  killOnPort(port);
  await new Promise((r) => setTimeout(r, 300)); // let OS reclaim the port

  const proc = spawn("node", [CLI_BIN, dbPath, "--port", String(port), "--no-open"], {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env },
  });
  proc.unref();

  proc.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`brain-map exited with code ${code}`);
    }
  });

  await waitForAlive(`http://localhost:${port}`);

  return () => {
    proc.kill("SIGTERM");
  };
}
