#!/usr/bin/env node
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Try compiled dist first, fall back to tsx for development
const distPath = resolve(__dirname, "../dist/index.js");

import(distPath).catch(async () => {
  const { execFileSync } = await import("child_process");
  const tsxPath = resolve(__dirname, "../../../node_modules/.bin/tsx");
  const srcPath = resolve(__dirname, "../src/index.ts");
  const args = [srcPath, ...process.argv.slice(2)];
  try {
    execFileSync(tsxPath, args, { stdio: "inherit" });
  } catch (e) {
    process.exit(1);
  }
});
