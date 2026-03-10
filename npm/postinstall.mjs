#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const PLATFORM_MAP = { darwin: "darwin", linux: "linux" };
const ARCH_MAP = { x64: "x64", arm64: "arm64" };

function detect() {
  const platform = PLATFORM_MAP[os.platform()];
  const arch = ARCH_MAP[os.arch()];
  if (!platform || !arch) {
    throw new Error(`Unsupported platform: ${os.platform()}-${os.arch()}`);
  }
  return { platform, arch };
}

function findBinary(name) {
  const { platform, arch } = detect();
  const pkg = `nitpiq-${platform}-${arch}`;

  const pkgJson = require.resolve(`${pkg}/package.json`);
  const pkgDir = path.dirname(pkgJson);
  const bin = path.join(pkgDir, "bin", name);

  if (!fs.existsSync(bin)) {
    throw new Error(`Binary not found at ${bin}`);
  }
  return bin;
}

function linkBinary(name) {
  const source = findBinary(name);
  const target = path.join(__dirname, "bin", `.${name}`);

  if (fs.existsSync(target)) fs.unlinkSync(target);

  try {
    fs.linkSync(source, target);
  } catch {
    fs.copyFileSync(source, target);
  }
  fs.chmodSync(target, 0o755);
}

try {
  linkBinary("nitpiq");
  linkBinary("nitpiq-mcp");
} catch (error) {
  console.error("nitpiq postinstall:", error.message);
  process.exit(1);
}
