#!/usr/bin/env bun

import { mkdirSync, cpSync, writeFileSync } from "node:fs";
import path from "node:path";

const VERSION = process.env.VERSION ?? "0.1.0";
const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");

const targets = [
  { bun: "bun-linux-x64", pkg: "nitpiq-linux-x64", os: "linux", cpu: "x64" },
  { bun: "bun-linux-arm64", pkg: "nitpiq-linux-arm64", os: "linux", cpu: "arm64" },
  { bun: "bun-darwin-x64", pkg: "nitpiq-darwin-x64", os: "darwin", cpu: "x64" },
  { bun: "bun-darwin-arm64", pkg: "nitpiq-darwin-arm64", os: "darwin", cpu: "arm64" },
];

const SHIMS = path.join(ROOT, "scripts", "shims");

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

// Build the main wrapper package
console.log("\n--- Building main nitpiq package ---");
const mainDir = path.join(DIST, "nitpiq");
const mainBinDir = path.join(mainDir, "bin");
mkdirSync(mainBinDir, { recursive: true });

cpSync(path.join(ROOT, "npm", "postinstall.mjs"), path.join(mainDir, "postinstall.mjs"));
cpSync(path.join(ROOT, "npm", "bin", "nitpiq"), path.join(mainBinDir, "nitpiq"));
cpSync(path.join(ROOT, "npm", "bin", "nitpiq-mcp"), path.join(mainBinDir, "nitpiq-mcp"));

const optDeps: Record<string, string> = {};
for (const t of targets) {
  optDeps[t.pkg] = VERSION;
}

writeFileSync(
  path.join(mainDir, "package.json"),
  JSON.stringify(
    {
      name: "nitpiq",
      version: VERSION,
      description: "Terminal-based code review tool for local git changes",
      license: "MIT",
      bin: {
        nitpiq: "bin/nitpiq",
        "nitpiq-mcp": "bin/nitpiq-mcp",
      },
      scripts: {
        postinstall: "node postinstall.mjs",
      },
      optionalDependencies: optDeps,
    },
    null,
    2,
  ) + "\n",
);

console.log("\nDone! Packages in dist/");
