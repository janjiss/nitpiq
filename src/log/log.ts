import { mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";

let logPath: string | null = null;

export function initLog(repoRoot: string): void {
  const dir = path.join(repoRoot, ".git", "custodian");
  mkdirSync(dir, { recursive: true });
  logPath = path.join(dir, "debug.log");
}

function write(level: string, message: string): void {
  if (!logPath) {
    return;
  }

  const line = `[${new Date().toISOString()}] ${level} ${message}\n`;
  appendFileSync(logPath, line);
}

export function debug(message: string): void {
  write("DEBUG", message);
}

export function error(message: string): void {
  write("ERROR", message);
}
