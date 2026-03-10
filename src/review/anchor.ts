import type { Thread } from "./types";

const RELOCATE_MAX_DELTA = 50;

export function relocateThreads(threads: Thread[], fileLines: string[]): Thread[] {
  return threads.map((thread) => relocateThread(thread, fileLines));
}

function relocateThread(thread: Thread, lines: string[]): Thread {
  if (thread.currentLine <= 0 || lines.length === 0) {
    return thread;
  }

  const next = { ...thread };
  const anchorLines = next.anchorContent.split("\n");
  const originalIndex = next.currentLine - 1;
  const rangeLength = next.lineEnd > next.currentLine ? next.lineEnd - next.currentLine : 0;

  if (anchorMatchesAt(lines, originalIndex, anchorLines)) {
    next.isOutdated = false;
    return next;
  }

  for (let delta = 1; delta <= RELOCATE_MAX_DELTA; delta += 1) {
    const up = originalIndex - delta;
    if (up >= 0 && anchorMatchesAt(lines, up, anchorLines)) {
      next.currentLine = up + 1;
      next.lineEnd = rangeLength > 0 ? next.currentLine + rangeLength : next.lineEnd;
      next.isOutdated = false;
      return next;
    }

    const down = originalIndex + delta;
    if (down >= 0 && anchorMatchesAt(lines, down, anchorLines)) {
      next.currentLine = down + 1;
      next.lineEnd = rangeLength > 0 ? next.currentLine + rangeLength : next.lineEnd;
      next.isOutdated = false;
      return next;
    }
  }

  if (next.contextBefore || next.contextAfter) {
    for (let index = 0; index < lines.length; index += 1) {
      if (matchesContext(lines, index, next.contextBefore, next.contextAfter)) {
        next.currentLine = index + 1;
        next.lineEnd = rangeLength > 0 ? next.currentLine + rangeLength : next.lineEnd;
        next.isOutdated = true;
        return next;
      }
    }
  }

  next.isOutdated = true;
  return next;
}

function anchorMatchesAt(lines: string[], index: number, anchorLines: string[]): boolean {
  if (index < 0 || index + anchorLines.length > lines.length) {
    return false;
  }

  for (let offset = 0; offset < anchorLines.length; offset += 1) {
    if (lines[index + offset] !== anchorLines[offset]) {
      return false;
    }
  }

  return true;
}

function matchesContext(lines: string[], index: number, before: string, after: string): boolean {
  if (before) {
    const beforeLines = before.split("\n");
    for (let offset = 0; offset < beforeLines.length; offset += 1) {
      const pos = index - beforeLines.length + offset;
      if (pos < 0 || pos >= lines.length || lines[pos] !== beforeLines[offset]) {
        return false;
      }
    }
  }

  if (after) {
    const afterLines = after.split("\n");
    for (let offset = 0; offset < afterLines.length; offset += 1) {
      const pos = index + 1 + offset;
      if (pos >= lines.length || lines[pos] !== afterLines[offset]) {
        return false;
      }
    }
  }

  return Boolean(before || after);
}

export function extractContext(fileContent: string, lineNumber: number) {
  const lines = fileContent.split("\n");
  const index = lineNumber - 1;

  if (index < 0 || index >= lines.length) {
    return { anchor: "", before: "", after: "" };
  }

  const beforeStart = Math.max(0, index - 3);
  const afterEnd = Math.min(lines.length, index + 4);

  return {
    anchor: lines[index] ?? "",
    before: lines.slice(beforeStart, index).join("\n"),
    after: lines.slice(index + 1, afterEnd).join("\n"),
  };
}

export function extractRangeAnchor(fileContent: string, startLine: number, endLine: number): string {
  const lines = fileContent.split("\n");
  const start = Math.max(0, startLine - 1);
  const end = Math.min(lines.length, endLine);
  return lines.slice(start, end).join("\n");
}
