import { readFileSync, statSync } from "node:fs";
import path from "node:path";

export type ChangeKind = "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked";

export interface FileChange {
  path: string;
  oldPath: string;
  kind: ChangeKind;
  staged: boolean;
  unstaged: boolean;
}

export interface Repo {
  root: string;
  name: string;
  hasHead: boolean;
}

export function kindSymbol(kind: ChangeKind): string {
  switch (kind) {
    case "modified":
      return "M";
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    case "untracked":
      return "?";
  }
}

export function openRepoAt(dir?: string): Repo {
  const root = runGit(["rev-parse", "--show-toplevel"], dir || process.cwd()).trim();
  const hasHead = runGitOptional(["rev-parse", "HEAD"], root).ok;

  return {
    root,
    name: path.basename(root),
    hasHead,
  };
}

export function openRepo(): Repo {
  return openRepoAt();
}

export function changes(repo: Repo): FileChange[] {
  const output = runGit(["status", "--porcelain=v1", "-uall"], repo.root);
  return parsePorcelain(output);
}

export function files(repo: Repo): string[] {
  const output = runGit(["ls-files", "--cached", "--others", "--exclude-standard"], repo.root);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of output.split("\n")) {
    const raw = line.trim();
    if (!raw) continue;
    const candidate = unquoteGitPath(raw);
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    result.push(candidate);
  }

  return result;
}

export function diff(repo: Repo, change: FileChange, contextLines = 3): string {
  if (change.kind === "untracked") {
    return diffUntracked(repo, change.path);
  }

  const context = `-U${contextLines}`;

  if (repo.hasHead) {
    const result = runGitOptional(["diff", context, "HEAD", "--", change.path], repo.root);
    if (result.ok && result.stdout.trim()) {
      return result.stdout;
    }
  }

  const cached = runGitOptional(["diff", context, "--cached", "--", change.path], repo.root);
  if (cached.ok && cached.stdout.trim()) {
    return cached.stdout;
  }

  const working = runGitOptional(["diff", context, "--", change.path], repo.root);
  if (working.ok && working.stdout.trim()) {
    return working.stdout;
  }

  return "(no diff available)";
}

function diffUntracked(repo: Repo, relativePath: string): string {
  const absolutePath = path.join(repo.root, relativePath);
  const stat = statSync(absolutePath);
  if (stat.isDirectory()) {
    return `(directory: ${relativePath})`;
  }

  const result = Bun.spawnSync(["git", "diff", "--no-index", "--", "/dev/null", absolutePath], {
    cwd: repo.root,
    stdout: "pipe",
    stderr: "pipe",
  });

  const text = `${result.stdout ? Buffer.from(result.stdout).toString() : ""}${result.stderr ? Buffer.from(result.stderr).toString() : ""}`;
  return text || "(empty file)";
}

export function readFile(repo: Repo, relativePath: string): string {
  const filePath = path.join(repo.root, relativePath);
  const stat = statSync(filePath);
  if (stat.isDirectory()) {
    throw new Error(`${relativePath} is a directory`);
  }
  return readFileSync(filePath, "utf8");
}

export function stage(repo: Repo, relativePath: string): void {
  runGit(["add", "--", relativePath], repo.root);
}

export function unstage(repo: Repo, relativePath: string): void {
  const restore = runGitOptional(["restore", "--staged", "--", relativePath], repo.root);
  if (restore.ok) {
    return;
  }

  const reset = runGitOptional(["reset", "HEAD", "--", relativePath], repo.root);
  if (reset.ok) {
    return;
  }

  const remove = runGitOptional(["rm", "--cached", "--", relativePath], repo.root);
  if (!remove.ok) {
    throw new Error(remove.stderr || `failed to unstage ${relativePath}`);
  }
}

function parsePorcelain(output: string): FileChange[] {
  const result: FileChange[] = [];

  for (const line of output.split("\n")) {
    if (line.length < 4) {
      continue;
    }

    const x = line[0] ?? " ";
    const y = line[1] ?? " ";
    let filePath = unquoteGitPath(line.slice(3));
    let oldPath = "";

    if (filePath.endsWith("/")) {
      continue;
    }

    const renameIndex = filePath.indexOf(" -> ");
    if (renameIndex >= 0) {
      oldPath = unquoteGitPath(filePath.slice(0, renameIndex));
      filePath = unquoteGitPath(filePath.slice(renameIndex + 4));
    }

    const change: FileChange = {
      path: filePath,
      oldPath,
      kind: "modified",
      staged: false,
      unstaged: false,
    };

    if (x === "?" && y === "?") {
      change.kind = "untracked";
      change.unstaged = true;
    } else {
      if (x !== " " && x !== "?") {
        change.staged = true;
        change.kind = charToKind(x);
      }
      if (y !== " " && y !== "?") {
        change.unstaged = true;
        if (!change.staged) {
          change.kind = charToKind(y);
        }
      }
    }

    result.push(change);
  }

  return result;
}

function unquoteGitPath(p: string): string {
  if (p.startsWith('"') && p.endsWith('"')) {
    return p
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
  }
  return p;
}

function charToKind(char: string): ChangeKind {
  switch (char) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "M":
    default:
      return "modified";
  }
}

function runGit(args: string[], cwd: string): string {
  const result = runGitOptional(args, cwd);
  if (!result.ok) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function runGitOptional(args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    ok: proc.exitCode === 0,
    stdout: proc.stdout ? Buffer.from(proc.stdout).toString() : "",
    stderr: proc.stderr ? Buffer.from(proc.stderr).toString().trim() : "",
  };
}

async function runGitAsync(args: string[], cwd: string): Promise<string> {
  const result = await runGitOptionalAsync(args, cwd);
  if (!result.ok) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

async function runGitOptionalAsync(args: string[], cwd: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  return { ok: exitCode === 0, stdout, stderr: stderr.trim() };
}

export async function changesAsync(repo: Repo): Promise<FileChange[]> {
  const output = await runGitAsync(["status", "--porcelain=v1", "-uall"], repo.root);
  return parsePorcelain(output);
}

export async function filesAsync(repo: Repo): Promise<string[]> {
  const output = await runGitAsync(["ls-files", "--cached", "--others", "--exclude-standard"], repo.root);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of output.split("\n")) {
    const raw = line.trim();
    if (!raw) continue;
    const candidate = unquoteGitPath(raw);
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    result.push(candidate);
  }
  return result;
}
