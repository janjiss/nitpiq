#!/usr/bin/env bun

import { readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");
const DRY_RUN = process.argv.includes("--dry-run");
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1];

const packages = readdirSync(DIST, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  // Publish platform packages first, then the main package last
  .sort((a, b) => {
    if (a === "nitpiq") return 1;
    if (b === "nitpiq") return -1;
    return a.localeCompare(b);
  });

for (const pkg of packages) {
  const pkgDir = path.join(DIST, pkg);
  const args = ["npm", "publish", "--access", "public", "--auth-type=web"];
  if (DRY_RUN) args.push("--dry-run");
  if (TAG) args.push("--tag", TAG);

  console.log(`\n--- Publishing ${pkg} ---`);
  const result = Bun.spawnSync(args, { cwd: pkgDir, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) {
    console.error(`Failed to publish ${pkg}`);
    process.exit(1);
  }
}

console.log("\nAll packages published!");
