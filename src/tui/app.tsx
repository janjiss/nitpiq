import React, { useEffect, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import Fuse from "fuse.js";
import pc from "picocolors";
import {
  changes,
  diff,
  files,
  kindSymbol,
  readFile,
  stage,
  unstage,
  type FileChange,
  type Repo,
} from "../git/repo";
import { error } from "../log/log";
import { extractContext, extractRangeAnchor, relocateThreads } from "../review/anchor";
import { AuthorHuman, ThreadOpen, ThreadResolved, type Comment, type ReviewSession, type Thread } from "../review/types";
import { Store } from "../store/store";
import type { DemoState } from "./demo";
import { fullFileRows, parseDiffRows, threadMap, visibleWindow, type DiffRow } from "./diff";
import { clearHighlightCache, highlightLine, renderMarkdown } from "./highlight";
import type { Theme } from "./theme";
import { bg, fg, getTheme } from "./theme";

type FocusPane = "files" | "diff";
type InputMode = "normal" | "comment" | "reply" | "filter" | "search" | "goto" | "visual" | "confirmDelete";
type FileListMode = "changes" | "all";
type ViewRow =
  | { kind: "diff"; row: DiffRow; diffIdx: number }
  | { kind: "spacer" }
  | { kind: "thread-border"; position: "top" | "bottom"; resolved: boolean }
  | { kind: "comment-separator"; resolved: boolean }
  | { kind: "inline-comment"; author: string; body: string; resolved: boolean; showAuthor: boolean }
  | { kind: "input-border"; position: "top" | "bottom" }
  | { kind: "input" };

// ── Child Components ─────────────────────────────────────────────

interface FileSidebarProps {
  listedPaths: string[];
  fileCursor: number;
  focused: boolean;
  fileChangeMap: Map<string, FileChange>;
  threadCounts: Record<string, number>;
  theme: Theme;
  width: number;
  height: number;
}

function FileSidebar({ listedPaths, fileCursor, focused, fileChangeMap, threadCounts, theme: t, width, height }: FileSidebarProps) {
  const win = visibleWindow(listedPaths, fileCursor, height);
  const blank = " ".repeat(width);
  const rows: string[] = [];
  for (let i = 0; i < height; i++) {
    if (i >= win.items.length) { rows.push(blank); continue; }
    const absIdx = win.start + i;
    const filePath = win.items[i]!;
    const change = fileChangeMap.get(filePath);
    const sel = absIdx === fileCursor;
    const sym = change ? kindSymbol(change.kind) : " ";
    const csym = colorSymbol(sym, change?.kind, t);
    const tc = threadCounts[filePath] ?? 0;
    const badge = tc > 0 ? fg(t.thread, ` ${tc}`) : "";
    const stg = change?.staged && !change.unstaged ? fg(t.staged, " ✓") : "";
    const pre = sel && focused ? fg(t.accent, "›") : " ";
    const name = sel ? pc.white(filePath) : pc.dim(filePath);
    const line = ` ${pre} ${csym} ${name}${badge}${stg}`;
    rows.push(sel && focused ? bg(t.selection, padAnsi(line, width)) : padAnsi(line, width));
  }
  return (
    <Box width={width} flexDirection="column">
      {rows.map((row, i) => <Text key={i} wrap="truncate-end">{row}</Text>)}
    </Box>
  );
}

interface DiffPaneProps {
  viewRows: ViewRow[];
  visualCursor: number;
  diffCursor: number;
  focused: boolean;
  markers: ReturnType<typeof threadMap>;
  inputMode: InputMode;
  draft: string;
  theme: Theme;
  width: number;
  height: number;
  visualAnchor: number | null;
  scrollOffset: number | null;
}

function DiffPane({ viewRows, visualCursor, diffCursor, focused, markers, inputMode, draft, theme: t, width, height, visualAnchor, scrollOffset }: DiffPaneProps) {
  const win = scrollOffset !== null
    ? scrolledWindow(viewRows, scrollOffset, height)
    : visibleWindow(viewRows, visualCursor, height);
  const blank = " ".repeat(width);
  const rows: string[] = [];
  for (let i = 0; i < height; i++) {
    if (i >= win.items.length) { rows.push(blank); continue; }
    const vr = win.items[i]!;

    if (vr.kind === "spacer") {
      rows.push(blank);
      continue;
    }

    if (vr.kind === "thread-border") {
      const indent = "       ";
      const dashW = Math.max(1, width - 11);
      const clr = vr.resolved ? t.staged : t.thread;
      const corner = vr.position === "top" ? "╭" : "╰";
      const cap = vr.position === "top" ? "╮" : "╯";
      rows.push(padAnsi(`${indent}${fg(clr, `${corner}${"─".repeat(dashW)}${cap}`)}`, width));
      continue;
    }

    if (vr.kind === "comment-separator") {
      const indent = "       ";
      const dashW = Math.max(1, width - 11);
      const clr = vr.resolved ? t.staged : t.thread;
      const sep = `├${"─".repeat(dashW)}┤`;
      rows.push(vr.resolved
        ? padAnsi(`${indent}${pc.dim(sep)}`, width)
        : bg(t.threadBg, padAnsi(`${indent}${fg(clr, sep)}`, width)));
      continue;
    }

    if (vr.kind === "inline-comment") {
      const clr = vr.resolved ? t.staged : t.thread;
      const pipe = vr.resolved ? pc.dim("│") : fg(clr, "│");
      const indent = "       ";
      const contentW = Math.max(1, width - 12);
      let line: string;
      if (vr.showAuthor) {
        const authorClr = vr.author === "model" ? t.accent : t.thread;
        const authorTag = vr.resolved ? pc.dim(pc.bold(vr.author)) : fg(authorClr, pc.bold(vr.author));
        line = `${indent}${pipe} ${padAnsi(authorTag, contentW)}${pipe}`;
      } else {
        const body = vr.resolved ? pc.dim(vr.body) : renderMarkdown(vr.body, t);
        line = `${indent}${pipe} ${padAnsi(body, contentW)}${pipe}`;
      }
      rows.push(vr.resolved ? padAnsi(line, width) : bg(t.threadBg, padAnsi(line, width)));
      continue;
    }

    if (vr.kind === "input-border") {
      const indent = "       ";
      const dashW = Math.max(1, width - 11);
      const corner = vr.position === "top" ? "╭" : "╰";
      const cap = vr.position === "top" ? "╮" : "╯";
      rows.push(padAnsi(`${indent}${fg(t.accent, `${corner}${"─".repeat(dashW)}${cap}`)}`, width));
      continue;
    }

    if (vr.kind === "input") {
      const contentW = Math.max(1, width - 12);
      const pipe = fg(t.accent, "│");
      const label = inputMode === "reply" ? "reply" : "comment";
      const content = `       ${pipe} ${padAnsi(`${fg(t.accent, label)}${pc.dim(":")} ${draft}█`, contentW)}${pipe}`;
      rows.push(bg(t.cursor, padAnsi(content, width)));
      continue;
    }

    const row = vr.row;
    const sel = vr.diffIdx === diffCursor && focused;
    const inVisualRange = visualAnchor !== null && focused &&
      vr.diffIdx >= Math.min(visualAnchor, diffCursor) &&
      vr.diffIdx <= Math.max(visualAnchor, diffCursor);
    const lineNum = row.newLine ?? row.oldLine;
    const lbl = lineNum ? String(lineNum).padStart(3) : "   ";
    const mark = lineNum && markers.has(lineNum) ? fg(t.thread, "●") : " ";

    const sign = row.kind === "add" ? fg(t.add, "+")
      : row.kind === "delete" ? fg(t.del, "-")
      : " ";

    const text = row.kind === "header" || row.kind === "meta" ? pc.dim(row.text)
      : row.kind === "hunk" ? fg(t.hunk, row.text)
      : highlightLine(row.text, t);

    const content = ` ${mark}${lbl} ${sign} ${text}`;

    if (sel) { rows.push(bg(t.cursor, padAnsi(content, width))); continue; }
    if (inVisualRange) { rows.push(bg(t.selection, padAnsi(content, width))); continue; }
    if (row.kind === "add") { rows.push(bg(t.addBg, padAnsi(content, width))); continue; }
    if (row.kind === "delete") { rows.push(bg(t.delBg, padAnsi(content, width))); continue; }
    rows.push(padAnsi(content, width));
  }
  return (
    <Box flexGrow={1} flexDirection="column">
      {rows.map((row, i) => <Text key={i} wrap="truncate-end">{row}</Text>)}
    </Box>
  );
}

// ── Main Component ───────────────────────────────────────────────

interface AppProps {
  repo: Repo;
  store: Store | null;
  demoState?: DemoState;
  snapshot?: boolean;
  theme?: string;
}

export function NitpiqApp({ repo, store, demoState, snapshot = false, theme }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const t = getTheme(theme);
  const initialDemoFile = demoState?.files[demoState.fileCursor] ?? demoState?.files[0] ?? null;
  const [session, setSession] = useState<ReviewSession | null>(demoState?.session ?? null);
  const [fileChanges, setFileChanges] = useState<FileChange[]>(demoState?.files.map((file) => file.change) ?? []);
  const [repoFiles, setRepoFiles] = useState<string[]>(demoState?.repoFiles ?? []);
  const [focus, setFocus] = useState<FocusPane>(demoState?.focus ?? "files");
  const [inputMode, setInputMode] = useState<InputMode>("normal");
  const [filterQuery, setFilterQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState(demoState?.status ?? "Loading...");
  const [showFullFile, setShowFullFile] = useState(demoState?.showFullFile ?? false);
  const [fileCursor, setFileCursor] = useState(demoState?.fileCursor ?? 0);
  const [diffCursor, setDiffCursor] = useState(demoState?.diffCursor ?? 0);
  const [currentPath, setCurrentPath] = useState(initialDemoFile?.change.path ?? "");
  const [currentDiff, setCurrentDiff] = useState(initialDemoFile?.diff ?? "");
  const [currentContent, setCurrentContent] = useState(initialDemoFile?.content ?? "");
  const [threads, setThreads] = useState<Thread[]>(initialDemoFile?.threads ?? []);
  const [commentsByThread, setCommentsByThread] = useState<Record<string, Comment[]>>(initialDemoFile?.commentsByThread ?? {});
  const [threadCounts, setThreadCounts] = useState<Record<string, number>>(demoState?.threadCounts ?? {});
  const [fileListMode, setFileListMode] = useState<FileListMode>("changes");
  const [expandedContext, setExpandedContext] = useState(3);
  const [visualAnchor, setVisualAnchor] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Thread | null>(null);
  const [allThreads, setAllThreads] = useState<Thread[]>([]);
  const [pendingLine, setPendingLine] = useState<number | null>(null);
  const [countPrefix, setCountPrefix] = useState("");
  const [pendingG, setPendingG] = useState(false);
  const [pendingZ, setPendingZ] = useState(false);
  const [scrollOffset, setScrollOffset] = useState<number | null>(null);
  const isDemo = Boolean(demoState);

  // ── Derived data (compiler auto-memoizes) ──────────────────────

  const allPaths = fileListMode === "changes"
    ? fileChanges.map((change) => change.path)
    : repoFiles;

  let listedPaths: string[];
  if (!filterQuery) {
    listedPaths = allPaths;
  } else {
    const fuse = new Fuse<{ path: string }>(allPaths.map((p) => ({ path: p })), { keys: ["path"], threshold: 0.4 });
    listedPaths = fuse.search(filterQuery).map((match) => match.item.path);
  }

  const fileChangeMap = new Map<string, FileChange>();
  for (const change of fileChanges) fileChangeMap.set(change.path, change);

  const selectedPath = listedPaths[fileCursor] ?? "";
  const selectedChange = fileChangeMap.get(selectedPath) ?? null;

  const diffRows = showFullFile ? fullFileRows(currentContent) : parseDiffRows(currentDiff);

  let searchMatches: number[];
  if (!searchQuery) {
    searchMatches = [];
  } else {
    const needle = searchQuery.toLowerCase();
    searchMatches = diffRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.text.toLowerCase().includes(needle))
      .map(({ index }) => index);
  }

  const markers = threadMap(threads);
  const selectedLine = diffRows[diffCursor]?.newLine ?? diffRows[diffCursor]?.oldLine ?? null;
  const threadsAtCursor = selectedLine ? markers.get(selectedLine) ?? [] : [];
  const threadAtLine = threadsAtCursor[0]?.thread ?? null;

  const tw = Math.max(stdout.columns || 120, 80);
  const sidebarW = Math.max(18, Math.floor(tw * 0.22));
  const diffPaneW = Math.max(10, (tw - 2) - sidebarW - 3);
  // Comment box: indent(7) + pipe(1) + space(1) + ... + space(1) + pipe(1) + space(1) = 12 total overhead
  const commentInnerW = Math.max(20, diffPaneW - 12);

  const baseViewRows: ViewRow[] = [];
  const diffToView = new Map<number, number>();
  for (let i = 0; i < diffRows.length; i++) {
    diffToView.set(i, baseViewRows.length);
    baseViewRows.push({ kind: "diff", row: diffRows[i]!, diffIdx: i });

    const lineNum = diffRows[i]!.newLine ?? diffRows[i]!.oldLine;
    if (lineNum) {
      const entries = markers.get(lineNum);
      if (entries) {
        for (const { thread } of entries) {
          const cs = commentsByThread[thread.id] ?? [];
          if (cs.length === 0) continue;
          const resolved = thread.status === ThreadResolved;
          baseViewRows.push({ kind: "spacer" });
          baseViewRows.push({ kind: "thread-border", position: "top", resolved });
          for (let ci = 0; ci < cs.length; ci++) {
            if (ci > 0) {
              baseViewRows.push({ kind: "comment-separator", resolved });
            }
            baseViewRows.push({
              kind: "inline-comment",
              author: cs[ci]!.author,
              body: "",
              resolved,
              showAuthor: true,
            });
            const wrappedLines = wrapText(cs[ci]!.body, commentInnerW, commentInnerW);
            for (const wl of wrappedLines) {
              baseViewRows.push({
                kind: "inline-comment",
                author: cs[ci]!.author,
                body: wl,
                resolved,
                showAuthor: false,
              });
            }
          }
          baseViewRows.push({ kind: "thread-border", position: "bottom", resolved });
          baseViewRows.push({ kind: "spacer" });
        }
      }
    }
  }

  const isInlineInput = inputMode === "comment" || inputMode === "reply";
  let viewRows: ViewRow[];
  if (!isInlineInput) {
    viewRows = baseViewRows;
  } else {
    const baseIdx = diffToView.get(diffCursor) ?? 0;
    let insertAt = baseIdx + 1;
    if (inputMode === "reply") {
      for (let si = baseIdx + 1; si < baseViewRows.length; si++) {
        const vr = baseViewRows[si]!;
        if (vr.kind === "thread-border" && vr.position === "bottom") { insertAt = si + 1; break; }
        if (vr.kind === "diff") break;
      }
    }
    viewRows = baseViewRows.slice();
    viewRows.splice(insertAt, 0,
      { kind: "spacer" },
      { kind: "input-border", position: "top" },
      { kind: "input" },
      { kind: "input-border", position: "bottom" },
      { kind: "spacer" },
    );
  }

  const visualCursor = diffToView.get(diffCursor) ?? 0;

  // ── Handlers ───────────────────────────────────────────────────

  const refreshAll = (activeSession: ReviewSession, soft = false): void => {
    if (!store) return;

    try {
      const nextChanges = changes(repo);
      const nextRepoFiles = files(repo);
      setFileChanges(nextChanges);
      setRepoFiles(nextRepoFiles);
      setThreadCounts(store.threadCountsByFile(activeSession.id));
      setAllThreads(store.listThreads(activeSession.id));

      if (!soft) {
        setStatus(`Loaded ${nextChanges.length} change(s)`);
      }

      if (currentPath) {
        loadThreads(activeSession, currentPath);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setStatus(message);
      error(message);
    }
  };

  const openPath = async (nextPath: string): Promise<void> => {
    clearHighlightCache();
    setCurrentPath(nextPath);
    setDiffCursor(0);
    if (demoState) {
      const selected = demoState.files.find((file) => file.change.path === nextPath);
      if (selected) {
        setCurrentContent(selected.content);
        setCurrentDiff(selected.diff);
        setThreads(selected.threads);
        setCommentsByThread(selected.commentsByThread);
        setStatus(demoState.status);
      }
      return;
    }

    let content: string;
    try {
      content = readFile(repo, nextPath);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setStatus(message);
      error(message);
      return;
    }
    const change = fileChangeMap.get(nextPath);
    const fileDiff = change ? diff(repo, change, expandedContext) : "";
    setCurrentContent(content);
    setCurrentDiff(fileDiff);
    if (!fileDiff) setShowFullFile(true);
    if (session) {
      loadThreads(session, nextPath, content);
    }
  };

  const loadThreads = (activeSession: ReviewSession, filePath: string, content = currentContent): void => {
    if (!store) return;

    const relocated = relocateThreads(store.listThreads(activeSession.id, filePath), content.split("\n"));
    for (const thread of relocated) {
      store.updateThreadLine(thread.id, thread.currentLine, thread.isOutdated);
    }
    setThreads(relocated);
    setCommentsByThread(store.listCommentsForThreads(relocated.map((thread) => thread.id)));
    setAllThreads(store.listThreads(activeSession.id));
  };

  const jumpToThread = (thread: Thread): void => {
    if (thread.filePath === currentPath) {
      const idx = diffRows.findIndex((r) => r.newLine === thread.currentLine || r.oldLine === thread.currentLine);
      if (idx >= 0) setDiffCursor(idx);
      setStatus(`Thread at ${thread.filePath}:${thread.currentLine}`);
    } else {
      const fileIdx = listedPaths.indexOf(thread.filePath);
      if (fileIdx >= 0) {
        setFileCursor(fileIdx);
      }
      setPendingLine(thread.currentLine);
      setFocus("diff");
      void openPath(thread.filePath);
      setStatus(`Thread at ${thread.filePath}:${thread.currentLine}`);
    }
  };

  const handleFileInput = (input: string, key: { upArrow?: boolean; downArrow?: boolean; return?: boolean; escape?: boolean }): void => {
    if (input === "q") { exit(); return; }
    if (input === "j" || key.downArrow) { setFileCursor((c: number) => Math.min(c + 1, Math.max(0, listedPaths.length - 1))); return; }
    if (input === "k" || key.upArrow) { setFileCursor((c: number) => Math.max(c - 1, 0)); return; }
    if (input === "l" || key.return) { setFocus("diff"); return; }
    if (input === "/") { setInputMode("filter"); setDraft(filterQuery); setStatus("Filter files"); return; }
    if (input === "f") {
      setFileListMode((c) => c === "changes" ? "all" : "changes");
      setFileCursor(0);
      setFilterQuery("");
      setStatus(fileListMode === "changes" ? "All files" : "Git changes");
      return;
    }
    if (input === "r") {
      if (isDemo) { setStatus("Demo mode - refresh is disabled"); return; }
      if (session) { refreshAll(session); setStatus("Refreshed"); }
      return;
    }
    if (input === "s" && selectedChange) {
      if (isDemo) { setStatus("Demo mode - staging is disabled"); return; }
      const shouldUnstage = selectedChange.staged && !selectedChange.unstaged;
      try {
        if (shouldUnstage) { unstage(repo, selectedChange.path); }
        else { stage(repo, selectedChange.path); }
      } catch (cause) {
        setStatus(cause instanceof Error ? cause.message : String(cause));
        return;
      }
      setStatus(shouldUnstage ? `Unstaged ${selectedChange.path}` : `Staged ${selectedChange.path}`);
      if (session) { refreshAll(session); }
      return;
    }
  };

  const handleDiffInput = (input: string, key: { upArrow?: boolean; downArrow?: boolean; return?: boolean; escape?: boolean; ctrl?: boolean; shift?: boolean }): void => {
    const lastRow = Math.max(0, diffRows.length - 1);
    const visibleH = Math.max(((stdout.rows || 30) - 6), 4);
    const halfPage = Math.max(Math.floor(visibleH / 2), 4);

    // Consume count prefix digits (only in normal diff mode, not during pending-g/z)
    if (/^[0-9]$/.test(input) && !key.ctrl && !pendingG && !pendingZ) {
      setCountPrefix((c) => c + input);
      return;
    }

    const count = countPrefix ? parseInt(countPrefix, 10) : 1;
    const clearCount = () => { setCountPrefix(""); setPendingG(false); setPendingZ(false); setScrollOffset(null); };

    // ── Pending z commands (zz, zt, zb) ──
    if (pendingZ) {
      if (input === "z") {
        setScrollOffset(Math.max(0, visualCursor - Math.floor(visibleH / 2)));
        setStatus("Centered");
      } else if (input === "t") {
        setScrollOffset(Math.max(0, visualCursor));
        setStatus("Scrolled to top");
      } else if (input === "b") {
        setScrollOffset(Math.max(0, visualCursor - visibleH + 1));
        setStatus("Scrolled to bottom");
      }
      setPendingZ(false);
      setCountPrefix("");
      return;
    }

    // ── Pending g commands (gg) ──
    if (pendingG) {
      if (input === "g") {
        setScrollOffset(null);
        setDiffCursor(count > 1 ? Math.min(count - 1, lastRow) : 0);
      }
      clearCount();
      return;
    }

    // ── Navigation ──
    if (input === "q" || key.escape || input === "h") { clearCount(); setFocus("files"); return; }

    if (input === "j" || key.downArrow) { setScrollOffset(null); setDiffCursor((c: number) => Math.min(c + count, lastRow)); clearCount(); return; }
    if (input === "k" || key.upArrow) { setScrollOffset(null); setDiffCursor((c: number) => Math.max(c - count, 0)); clearCount(); return; }

    if (key.ctrl && input === "d") { setScrollOffset(null); setDiffCursor((c: number) => Math.min(c + halfPage * count, lastRow)); clearCount(); return; }
    if (key.ctrl && input === "u") { setScrollOffset(null); setDiffCursor((c: number) => Math.max(c - halfPage * count, 0)); clearCount(); return; }
    if (key.ctrl && input === "f") { setScrollOffset(null); setDiffCursor((c: number) => Math.min(c + visibleH * count, lastRow)); clearCount(); return; }
    if (key.ctrl && input === "b") { setScrollOffset(null); setDiffCursor((c: number) => Math.max(c - visibleH * count, 0)); clearCount(); return; }

    if (input === "g") { setPendingG(true); return; }
    if (input === "G") {
      setScrollOffset(null);
      setDiffCursor(count > 1 ? Math.min(count - 1, lastRow) : lastRow);
      clearCount();
      return;
    }

    if (input === "H") { setDiffCursor((_: number) => { const win = scrollOffset !== null ? scrolledWindow(viewRows, scrollOffset, visibleH) : visibleWindow(viewRows, visualCursor, visibleH); return Math.max(0, win.start); }); clearCount(); return; }
    if (input === "M") { setDiffCursor((_: number) => { const win = scrollOffset !== null ? scrolledWindow(viewRows, scrollOffset, visibleH) : visibleWindow(viewRows, visualCursor, visibleH); return Math.min(lastRow, win.start + Math.floor(visibleH / 2)); }); clearCount(); return; }
    if (input === "L") { setDiffCursor((_: number) => { const win = scrollOffset !== null ? scrolledWindow(viewRows, scrollOffset, visibleH) : visibleWindow(viewRows, visualCursor, visibleH); return Math.min(lastRow, win.start + visibleH - 1); }); clearCount(); return; }

    if (input === "z") { setPendingZ(true); return; }

    // w/b: next/prev changed line (add/delete)
    if (input === "w") {
      for (let n = 0, i = diffCursor + 1; i <= lastRow; i++) {
        const k = diffRows[i]?.kind;
        if (k === "add" || k === "delete") { n++; if (n >= count) { setDiffCursor(i); break; } }
      }
      clearCount();
      return;
    }
    if (input === "b") {
      for (let n = 0, i = diffCursor - 1; i >= 0; i--) {
        const k = diffRows[i]?.kind;
        if (k === "add" || k === "delete") { n++; if (n >= count) { setDiffCursor(i); break; } }
      }
      clearCount();
      return;
    }

    // ── Block navigation (vim-like { and }) ──
    // Block boundary = hunk header, meta, or blank line.
    // Kitty keyboard protocol may send { as [ with shift, and } as ] with shift.
    if (input === "}" || (input === "]" && key.shift)) {
      let cur = diffCursor;
      for (let n = 0; n < count; n++) {
        while (cur + 1 <= lastRow && isBlockBoundary(diffRows, cur)) cur++;
        while (cur + 1 <= lastRow && !isBlockBoundary(diffRows, cur + 1)) cur++;
        if (cur + 1 <= lastRow) cur++;
      }
      setDiffCursor(cur);
      clearCount();
      return;
    }
    if (input === "{" || (input === "[" && key.shift)) {
      let cur = diffCursor;
      for (let n = 0; n < count; n++) {
        while (cur - 1 >= 0 && isBlockBoundary(diffRows, cur)) cur--;
        while (cur - 1 >= 0 && !isBlockBoundary(diffRows, cur - 1)) cur--;
        if (cur - 1 >= 0) cur--;
      }
      setDiffCursor(cur);
      clearCount();
      return;
    }

    if (input === "]" && !key.shift) {
      const threadLines = [...markers.keys()].sort((a, b) => a - b);
      const curLine = selectedLine ?? 0;
      const nextLine = threadLines.find((l) => l > curLine);
      if (nextLine) {
        const idx = diffRows.findIndex((r) => r.newLine === nextLine || r.oldLine === nextLine);
        if (idx >= 0) setDiffCursor(idx);
      } else {
        const nextThread = allThreads.find((th) => th.filePath > currentPath);
        if (nextThread) { jumpToThread(nextThread); }
        else if (allThreads.length > 0) { jumpToThread(allThreads[0]!); }
      }
      clearCount();
      return;
    }
    if (input === "[" && !key.shift) {
      const threadLines = [...markers.keys()].sort((a, b) => b - a);
      const curLine = selectedLine ?? Infinity;
      const prevLine = threadLines.find((l) => l < curLine);
      if (prevLine) {
        const idx = diffRows.findIndex((r) => r.newLine === prevLine || r.oldLine === prevLine);
        if (idx >= 0) setDiffCursor(idx);
      } else {
        const prevThread = [...allThreads].reverse().find((th) => th.filePath < currentPath);
        if (prevThread) {
          const lastInFile = [...allThreads].reverse().find((th) => th.filePath === prevThread.filePath);
          jumpToThread(lastInFile ?? prevThread);
        } else if (allThreads.length > 0) {
          const lastThread = allThreads[allThreads.length - 1]!;
          const lastInFile = [...allThreads].reverse().find((th) => th.filePath === lastThread.filePath);
          jumpToThread(lastInFile ?? lastThread);
        }
      }
      clearCount();
      return;
    }

    if (input === ":") { clearCount(); setInputMode("goto"); setDraft(""); setStatus("Go to line"); return; }
    if (input === "f") {
      clearCount();
      if (showFullFile && !currentDiff) { setStatus("No diff available"); return; }
      setShowFullFile((c: boolean) => !c);
      return;
    }
    if (input === "e" && !showFullFile) {
      const next = expandedContext === 3 ? 10 : expandedContext === 10 ? 999 : 3;
      setExpandedContext(next);
      if (selectedChange) {
        setCurrentDiff(diff(repo, selectedChange, next));
      }
      setStatus(next >= 999 ? "Full context" : `Context: ${next} lines`);
      return;
    }
    if (input === "v") {
      clearCount();
      setInputMode("visual");
      setVisualAnchor(diffCursor);
      setStatus("Visual mode — j/k extend, c comment, Esc cancel");
      return;
    }
    if (input === "d" && threadAtLine) {
      clearCount();
      if (!store) { setStatus("Demo mode - delete is disabled"); return; }
      setDeleteTarget(threadAtLine);
      setInputMode("confirmDelete");
      setStatus(`Delete thread ${threadAtLine.id.slice(0, 8)}? (y/n)`);
      return;
    }
    if (input === "/") { clearCount(); setInputMode("search"); setDraft(searchQuery); setStatus("Search diff"); return; }
    if (input === "n" && searchMatches.length > 0) {
      setDiffCursor(searchMatches.find((index) => index > diffCursor) ?? searchMatches[0] ?? 0);
      clearCount();
      return;
    }
    if (input === "N" && searchMatches.length > 0) {
      setDiffCursor([...searchMatches].reverse().find((index) => index < diffCursor) ?? searchMatches[searchMatches.length - 1] ?? 0);
      clearCount();
      return;
    }

    if (input === "r" && threadAtLine) {
      clearCount();
      if (!store) { setStatus("Demo mode - thread status is read-only"); return; }
      store.updateThreadStatus(threadAtLine.id, threadAtLine.status === ThreadResolved ? ThreadOpen : ThreadResolved);
      if (session) { loadThreads(session, currentPath); }
      setStatus(`${threadAtLine.status === ThreadResolved ? "Reopened" : "Resolved"} thread ${threadAtLine.id.slice(0, 8)}`);
      return;
    }

    if (input === "c") {
      clearCount();
      if (isDemo) { setStatus("Demo mode - comments are disabled"); return; }
      setInputMode(threadAtLine ? "reply" : "comment");
      setDraft("");
      setStatus(threadAtLine ? "Reply to thread" : "Add comment on current line");
      return;
    }

    clearCount();
  };

  const commitPrompt = (): void => {
    const value = draft.trim();
    if (inputMode === "goto") {
      const lineNum = parseInt(draft, 10);
      setInputMode("normal");
      setDraft("");
      if (!isNaN(lineNum) && lineNum > 0) {
        const rowIdx = diffRows.findIndex((r) => r.newLine === lineNum || r.oldLine === lineNum);
        if (rowIdx >= 0) { setDiffCursor(rowIdx); setStatus(`Line ${lineNum}`); }
        else { setStatus(`Line ${lineNum} not found`); }
      }
      return;
    }

    if (inputMode === "filter") {
      setFilterQuery(draft);
      setFileCursor(0);
      setInputMode("normal");
      setFocus("diff");
      setStatus(`Filtered ${listedPaths.length} file(s)`);
      return;
    }

    if (inputMode === "search") {
      setSearchQuery(draft);
      setInputMode("normal");
      const first = diffRows.findIndex((row) => row.text.toLowerCase().includes(value.toLowerCase()));
      if (first >= 0) { setDiffCursor(first); }
      setStatus(value ? `Found ${searchMatches.length} match(es)` : "Cleared search");
      return;
    }

    if (!value || !session || !store) { setInputMode("normal"); return; }

    if (inputMode === "comment") {
      const startIdx = visualAnchor !== null ? Math.min(visualAnchor, diffCursor) : diffCursor;
      const endIdx = visualAnchor !== null ? Math.max(visualAnchor, diffCursor) : diffCursor;
      const startLine = diffRows[startIdx]?.newLine ?? diffRows[startIdx]?.oldLine ?? null;
      const endLine = diffRows[endIdx]?.newLine ?? diffRows[endIdx]?.oldLine ?? null;
      if (!startLine) { setStatus("Current row is not commentable"); setInputMode("normal"); setVisualAnchor(null); return; }

      const { anchor, before, after } = extractContext(currentContent, startLine);
      const thread = store.createThread({
        sessionId: session.id,
        filePath: currentPath,
        side: "new",
        originalLine: startLine,
        lineEnd: endLine && endLine > startLine ? endLine : 0,
        currentLine: startLine,
        anchorContent: anchor || extractRangeAnchor(currentContent, startLine, endLine ?? startLine),
        contextBefore: before,
        contextAfter: after,
      });
      store.addComment({ threadId: thread.id, author: AuthorHuman, body: value });
      loadThreads(session, currentPath);
      const label = endLine && endLine > startLine ? `${currentPath}:${startLine}-${endLine}` : `${currentPath}:${startLine}`;
      setStatus(`Commented on ${label}`);
      setVisualAnchor(null);
    }

    if (inputMode === "reply") {
      const thread = threadAtLine;
      if (!thread) { setStatus("No active thread selected"); }
      else {
        store.addComment({ threadId: thread.id, author: AuthorHuman, body: value });
        loadThreads(session, currentPath);
        setStatus(`Replied to thread ${thread.id.slice(0, 8)}`);
      }
    }

    setDraft("");
    setInputMode("normal");
  };

  const handlePromptInput = (input: string, key: { escape?: boolean; return?: boolean; backspace?: boolean; delete?: boolean }): void => {
    if (key.escape) { setInputMode("normal"); setDraft(""); setStatus("Cancelled"); return; }
    if (key.backspace || key.delete || input === "\b" || input === "\x7f") { setDraft((c: string) => c.slice(0, -1)); return; }
    if (key.return) { commitPrompt(); return; }
    if (input) {
      if (inputMode === "goto" && !/^[0-9]$/.test(input)) return;
      setDraft((c: string) => c + input);
    }
  };

  // ── Effects ────────────────────────────────────────────────────

  useEffect(() => {
    if (demoState) {
      const selected = demoState.files[demoState.fileCursor] ?? demoState.files[0];
      setSession(demoState.session);
      setFileChanges(demoState.files.map((file) => file.change));
      setRepoFiles(demoState.repoFiles);
      setFocus(demoState.focus);
      setStatus(demoState.status);
      setShowFullFile(demoState.showFullFile);
      setFileCursor(demoState.fileCursor);
      setDiffCursor(demoState.diffCursor);
      setThreadCounts(demoState.threadCounts);
      if (selected) {
        setCurrentPath(selected.change.path);
        setCurrentDiff(selected.diff);
        setCurrentContent(selected.content);
        setThreads(selected.threads);
        setCommentsByThread(selected.commentsByThread);
      }
      return;
    }

    if (!store) return;

    const active = store.activeSession() ?? store.createSession(repo.root);
    setSession(active);
    refreshAll(active);
    const timer = setInterval(async () => {
      await new Promise((r) => setTimeout(r, 0));
      refreshAll(active, true);
    }, 5000);
    return () => clearInterval(timer);
  }, [demoState, repo.root, store]);

  useEffect(() => {
    if (!snapshot) return;
    const timer = setTimeout(() => exit(), 150);
    return () => clearTimeout(timer);
  }, [exit, snapshot]);

  useEffect(() => {
    if (pendingLine === null) return;
    const idx = diffRows.findIndex((r) => r.newLine === pendingLine || r.oldLine === pendingLine);
    if (idx >= 0) {
      setDiffCursor(idx);
    }
    setPendingLine(null);
  }, [pendingLine, diffRows]);

  useEffect(() => {
    if (listedPaths.length === 0) {
      setCurrentPath("");
      setCurrentDiff("");
      setCurrentContent("");
      setThreads([]);
      return;
    }

    const nextPath = listedPaths[Math.min(fileCursor, listedPaths.length - 1)] ?? listedPaths[0] ?? "";
    if (nextPath && nextPath !== currentPath) {
      void openPath(nextPath);
    }
  }, [currentPath, fileCursor, listedPaths, showFullFile, expandedContext]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") { exit(); return; }

    if (inputMode === "confirmDelete") {
      if (input === "y" && deleteTarget && store && session) {
        store.deleteThread(deleteTarget.id);
        loadThreads(session, currentPath);
        setStatus(`Deleted thread ${deleteTarget.id.slice(0, 8)}`);
      } else {
        setStatus("Cancelled");
      }
      setInputMode("normal");
      setDeleteTarget(null);
      return;
    }

    if (inputMode === "visual") {
      const lastRow = Math.max(0, diffRows.length - 1);
      if (/^[0-9]$/.test(input) && !key.ctrl) { setCountPrefix((c) => c + input); return; }
      const vCount = countPrefix ? parseInt(countPrefix, 10) : 1;
      if (input === "j" || key.downArrow) { setDiffCursor((c: number) => Math.min(c + vCount, lastRow)); setCountPrefix(""); return; }
      if (input === "k" || key.upArrow) { setDiffCursor((c: number) => Math.max(c - vCount, 0)); setCountPrefix(""); return; }
      if (input === "c") {
        if (isDemo) { setStatus("Demo mode - comments are disabled"); setInputMode("normal"); setVisualAnchor(null); return; }
        setInputMode("comment");
        setDraft("");
        const startLine = Math.min(visualAnchor ?? diffCursor, diffCursor);
        const endLine = Math.max(visualAnchor ?? diffCursor, diffCursor);
        const s = diffRows[startLine]?.newLine ?? diffRows[startLine]?.oldLine ?? 0;
        const e = diffRows[endLine]?.newLine ?? diffRows[endLine]?.oldLine ?? 0;
        setStatus(`Comment on lines ${s}-${e}`);
        return;
      }
      if (key.escape) { setInputMode("normal"); setVisualAnchor(null); setStatus(""); return; }
      return;
    }

    if (inputMode === "filter") {
      if (key.upArrow) { setFileCursor((c: number) => Math.max(c - 1, 0)); return; }
      if (key.downArrow) { setFileCursor((c: number) => Math.min(c + 1, Math.max(0, listedPaths.length - 1))); return; }
      handlePromptInput(input, key);
      return;
    }

    if (inputMode !== "normal") { handlePromptInput(input, key); return; }

    if (input === "\t") { setFocus((c: FocusPane) => c === "files" ? "diff" : "files"); return; }
    if (focus === "files") { handleFileInput(input, key); return; }
    handleDiffInput(input, key);
  });

  // ── Layout ─────────────────────────────────────────────────────

  const th = Math.max(stdout.rows || 30, 18);
  const innerW = tw - 2;
  const innerH = th - 2;
  const sepW = 3;
  const contentH = Math.max(innerH - 4, 4);
  const sepChar = pc.dim("│");

  const titleLeft = ` ${fg(t.accent, pc.bold(repo.name))}`;
  const modeLabel = showFullFile ? "full" : expandedContext > 3 ? `diff +${expandedContext}` : "diff";
  const countLabel = fileListMode === "changes"
    ? `${fileChanges.length} change${fileChanges.length !== 1 ? "s" : ""}`
    : `${repoFiles.length} file${repoFiles.length !== 1 ? "s" : ""}`;
  const titleRight = `${pc.dim(`${modeLabel} · ${countLabel}`)} `;

  const fHeader = fileListMode === "changes" ? "changed files" : "all files";
  const fLabel = focus === "files" ? fg(t.accent, pc.bold(fHeader)) : pc.dim(fHeader);
  const pLabel = currentPath
    ? (focus === "diff" ? fg(t.accent, pc.bold(currentPath)) : pc.dim(currentPath))
    : pc.dim("—");

  const footerInputModes: InputMode[] = ["comment", "reply", "visual", "confirmDelete"];
  const showInputInFooter = inputMode !== "normal" && !footerInputModes.includes(inputMode);
  const vimPending = countPrefix + (pendingG ? "g" : "") + (pendingZ ? "z" : "");
  const statusLine = showInputInFooter
    ? ` ${fg(t.accent, inputMode)}${pc.dim(":")} ${draft}`
    : vimPending
      ? ` ${fg(t.accent, vimPending)}`
      : ` ${pc.dim(status)}`;

  let keybinds: string;
  if (inputMode === "visual") {
    keybinds = "j/k extend  c comment  Esc cancel";
  } else if (inputMode === "filter") {
    keybinds = "type to filter  ↑/↓ navigate  ⏎ select  Esc clear";
  } else if (inputMode === "confirmDelete") {
    keybinds = "y confirm  any other key cancel";
  } else if (inputMode === "search" || inputMode === "goto") {
    keybinds = "type to " + inputMode + "  ⏎ confirm  Esc cancel";
  } else if (focus === "files") {
    keybinds = `j/k ↕  l/⏎ open  f ${fileListMode === "changes" ? "all" : "changes"}  / filter  s stage  r refresh  q quit`;
  } else {
    const threadHints = threadAtLine ? "  r resolve  d delete" : "";
    keybinds = `j/k ↕  gg/G top/end  w/b change  {/} hunk  [/] thread  zz center  / search  c comment  v visual${threadHints}  q back`;
  }

  const separators: string[] = [];
  for (let i = 0; i < contentH; i++) separators.push(` ${sepChar} `);

  return (
    <Box width={tw} height={th} borderStyle="round" borderColor={t.border} flexDirection="column">
      <Text wrap="truncate-end">{padBetween(titleLeft, titleRight, innerW)}</Text>
      <Text wrap="truncate-end">{padAnsi(` ${fLabel}`, sidebarW)} {sepChar} {padAnsi(` ${pLabel}`, diffPaneW)}</Text>
      <Box flexDirection="row">
        <FileSidebar
          listedPaths={listedPaths}
          fileCursor={fileCursor}
          focused={focus === "files"}
          fileChangeMap={fileChangeMap}
          threadCounts={threadCounts}
          theme={t}
          width={sidebarW}
          height={contentH}
        />
        <Box width={sepW} flexDirection="column">
          {separators.map((s, i) => <Text key={i}>{s}</Text>)}
        </Box>
        <DiffPane
          viewRows={viewRows}
          visualCursor={visualCursor}
          diffCursor={diffCursor}
          focused={focus === "diff"}
          markers={markers}
          inputMode={inputMode}
          draft={draft}
          theme={t}
          width={diffPaneW}
          height={contentH}
          visualAnchor={inputMode === "visual" ? visualAnchor : null}
          scrollOffset={scrollOffset}
        />
      </Box>
      <Text wrap="truncate-end">{padAnsi(statusLine, innerW)}</Text>
      <Text wrap="truncate-end">{padAnsi(` ${pc.dim(keybinds)}`, innerW)}</Text>
    </Box>
  );
}

// ── Module-level utilities ───────────────────────────────────────

function isBlockBoundary(rows: DiffRow[], idx: number): boolean {
  if (idx < 0 || idx >= rows.length) return true;
  const row = rows[idx]!;
  if (row.kind === "hunk" || row.kind === "header" || row.kind === "meta") return true;
  return row.text.trim() === "";
}

function scrolledWindow<T>(items: T[], start: number, height: number): { start: number; end: number; items: T[] } {
  const s = Math.max(0, Math.min(start, items.length - height));
  const e = Math.min(items.length, s + height);
  return { start: s, end: e, items: items.slice(s, e) };
}

function colorSymbol(sym: string, kind: FileChange["kind"] | undefined, t: Theme): string {
  switch (kind) {
    case "added": return fg(t.add, sym);
    case "deleted": return fg(t.del, sym);
    case "renamed":
    case "copied": return fg(t.warning, sym);
    case "untracked": return fg(t.hunk, sym);
    default: return pc.white(sym);
  }
}

function visibleLength(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0x1b && text.charCodeAt(i + 1) === 0x5b) {
      i += 2;
      while (i < text.length && text.charCodeAt(i) !== 0x6d) i++;
      continue;
    }
    count++;
  }
  return count;
}

function padAnsi(text: string, width: number): string {
  let visible = 0;
  let truncIdx = -1;
  const limit = width - 1;

  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0x1b && text.charCodeAt(i + 1) === 0x5b) {
      i += 2;
      while (i < text.length && text.charCodeAt(i) !== 0x6d) i++;
      continue;
    }
    visible++;
    if (truncIdx === -1 && visible > limit && visible > width) {
      truncIdx = i;
    }
  }

  if (visible <= width) {
    return visible === width ? text : `${text}${" ".repeat(width - visible)}`;
  }

  let result = "";
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0x1b && text.charCodeAt(i + 1) === 0x5b) {
      const start = i;
      i += 2;
      while (i < text.length && text.charCodeAt(i) !== 0x6d) i++;
      result += text.slice(start, i + 1);
      continue;
    }
    if (seen >= limit) {
      return `${result}…\u001b[0m`;
    }
    result += text[i];
    seen++;
  }

  return result;
}

function padBetween(left: string, right: string, width: number): string {
  const leftLen = visibleLength(left);
  const rightLen = visibleLength(right);
  const gap = Math.max(1, width - leftLen - rightLen);
  return `${left}${" ".repeat(gap)}${right}`;
}

function wrapText(text: string, firstLineW: number, contLineW: number): string[] {
  const result: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) { result.push(""); continue; }
    const maxW = result.length === 0 ? firstLineW : contLineW;
    if (paragraph.length <= maxW) { result.push(paragraph); continue; }
    let pos = 0;
    while (pos < paragraph.length) {
      const w = result.length === 0 ? firstLineW : contLineW;
      if (pos + w >= paragraph.length) { result.push(paragraph.slice(pos)); break; }
      let breakAt = paragraph.lastIndexOf(" ", pos + w);
      if (breakAt <= pos) breakAt = pos + w;
      result.push(paragraph.slice(pos, breakAt));
      pos = breakAt;
      if (paragraph[pos] === " ") pos++;
    }
  }
  if (result.length === 0) result.push("");
  return result;
}
