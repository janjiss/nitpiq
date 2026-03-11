import type { Thread } from "../review/types";

export type DiffRowKind = "header" | "hunk" | "context" | "add" | "delete" | "meta";

export interface DiffRow {
  kind: DiffRowKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface ThreadMarker {
  thread: Thread;
  preview: string;
}

type ThreadSide = "old" | "new";

export function parseDiffRows(diffText: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of diffText.split("\n")) {
    if (line.startsWith("@@")) {
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      oldLine = match ? Number(match[1]) : 0;
      newLine = match ? Number(match[2]) : 0;
      rows.push({ kind: "hunk", text: line, oldLine: null, newLine: null });
      continue;
    }

    if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      rows.push({ kind: "add", text: line.slice(1), oldLine: null, newLine });
      newLine += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      rows.push({ kind: "delete", text: line.slice(1), oldLine, newLine: null });
      oldLine += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      rows.push({ kind: "context", text: line.slice(1), oldLine, newLine });
      oldLine += 1;
      newLine += 1;
      continue;
    }

    rows.push({ kind: "meta", text: line, oldLine: null, newLine: null });
  }

  return rows;
}

export function fullFileRows(content: string): DiffRow[] {
  return content.split("\n").map((line, index) => ({
    kind: "context",
    text: line,
    oldLine: index + 1,
    newLine: index + 1,
  }));
}

export function threadMap(threads: Thread[]): Map<number, ThreadMarker[]> {
  const map = new Map<number, ThreadMarker[]>();
  for (const thread of threads) {
    if (thread.currentLine <= 0) {
      continue;
    }

    const preview = thread.firstComment.split("\n")[0] ?? "";
    const marker: ThreadMarker = { thread, preview };
    const existing = map.get(thread.currentLine) ?? [];
    existing.push(marker);
    map.set(thread.currentLine, existing);
  }
  return map;
}

export function threadMapBySide(threads: Thread[]): Map<string, ThreadMarker[]> {
  const map = new Map<string, ThreadMarker[]>();
  for (const thread of threads) {
    if (thread.currentLine <= 0) {
      continue;
    }

    const preview = thread.firstComment.split("\n")[0] ?? "";
    const marker: ThreadMarker = { thread, preview };
    const existing = map.get(threadMarkerKey(thread.side === "old" ? "old" : "new", thread.currentLine)) ?? [];
    existing.push(marker);
    map.set(threadMarkerKey(thread.side === "old" ? "old" : "new", thread.currentLine), existing);
  }
  return map;
}

export function markersForDiffRow(markers: Map<string, ThreadMarker[]>, row: DiffRow): ThreadMarker[] {
  const result: ThreadMarker[] = [];
  const seen = new Set<string>();

  const addMarkers = (side: ThreadSide, line: number | null) => {
    if (!line) {
      return;
    }

    for (const marker of markers.get(threadMarkerKey(side, line)) ?? []) {
      if (seen.has(marker.thread.id)) {
        continue;
      }
      seen.add(marker.thread.id);
      result.push(marker);
    }
  };

  if (row.kind === "delete") {
    addMarkers("old", row.oldLine);
    return result;
  }

  addMarkers("new", row.newLine);
  if (row.kind === "context") {
    addMarkers("old", row.oldLine);
  }
  return result;
}

function threadMarkerKey(side: ThreadSide, line: number): string {
  return `${side}:${line}`;
}

export function visibleWindow<T>(items: T[], cursor: number, height: number): { start: number; end: number; items: T[] } {
  if (items.length <= height) {
    return { start: 0, end: items.length, items };
  }

  const half = Math.floor(height / 2);
  let start = Math.max(0, cursor - half);
  let end = start + height;
  if (end > items.length) {
    end = items.length;
    start = Math.max(0, end - height);
  }

  return { start, end, items: items.slice(start, end) };
}
