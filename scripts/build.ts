#!/usr/bin/env bun

import { mkdirSync, cpSync, writeFileSync } from "node:fs";
import path from "node:path";

const VERSION = process.env.VERSION ?? "0.8.0";
const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");

const targets = [
  { bun: "bun-linux-x64", pkg: "nitpiq-linux-x64", os: "linux", cpu: "x64" },
  { bun: "bun-linux-arm64", pkg: "nitpiq-linux-arm64", os: "linux", cpu: "arm64" },
  { bun: "bun-darwin-x64", pkg: "nitpiq-darwin-x64", os: "darwin", cpu: "x64" },
  { bun: "bun-darwin-arm64", pkg: "nitpiq-darwin-arm64", os: "darwin", cpu: "arm64" },
];

const SHIMS = path.join(ROOT, "scripts", "shims");

function createWrapperPackage(name: string, bins: string[]) {
  console.log(`\n--- Building ${name} package ---`);
  const pkgDir = path.join(DIST, name);
  const binDir = path.join(pkgDir, "bin");
  mkdirSync(binDir, { recursive: true });

  cpSync(path.join(ROOT, "npm", "postinstall.mjs"), path.join(pkgDir, "postinstall.mjs"));
  for (const bin of bins) {
    cpSync(path.join(ROOT, "npm", "bin", bin), path.join(binDir, bin));
  }

  const optDeps: Record<string, string> = {};
  for (const t of targets) {
    optDeps[t.pkg] = VERSION;
  }

  writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify(
      {
        name,
        version: VERSION,
        description: name === "nitpiq-mcp"
          ? "MCP server for nitpiq local code review"
          : "Terminal-based code review tool for local git changes",
        license: "MIT",
        bin: Object.fromEntries(bins.map((bin) => [bin, `bin/${bin}`])),
        scripts: {
          postinstall: "node postinstall.mjs",
        },
        optionalDependencies: optDeps,
      },
      null,
      2,
    ) + "\n",
  );
}

function compile(entry: string, outfile: string, target: string) {
  const result = Bun.spawnSync(
    [
      "bun", "build", entry, "--compile",
      `--target=${target}`,
      `--outfile=${outfile}`,
      "--packages", "bundle",
    ],
    {
      cwd: ROOT,
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        // Bun resolves modules from NODE_PATH before node_modules,
        // so our shim for react-devtools-core takes precedence.
        NODE_PATH: SHIMS,
      },
    },
  );
  if (result.exitCode !== 0) {
    throw new Error(`Failed to compile ${entry} for ${target}`);
  }
}

for (const t of targets) {
  console.log(`\n--- Building ${t.pkg} ---`);
  const pkgDir = path.join(DIST, t.pkg);
  const binDir = path.join(pkgDir, "bin");
  mkdirSync(binDir, { recursive: true });

  compile("src/cli/nitpiq.tsx", path.join(binDir, "nitpiq"), t.bun);
  compile("src/cli/nitpiq-mcp.ts", path.join(binDir, "nitpiq-mcp"), t.bun);

  writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify(
      {
        name: t.pkg,
        version: VERSION,
        description: `nitpiq binary for ${t.os}-${t.cpu}`,
        license: "MIT",
        os: [t.os],
        cpu: [t.cpu],
      },
      null,
      2,
    ) + "\n",
  );
}

createWrapperPackage("nitpiq", ["nitpiq", "nitpiq-mcp"]);
createWrapperPackage("nitpiq-mcp", ["nitpiq-mcp"]);

console.log("\nDone! Packages in dist/");
