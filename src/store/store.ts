import { mkdirSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { AuthorHuman, ThreadOpen, type Author, type Comment, type NewComment, type NewThread, type ReviewSession, type Thread, type ThreadStatus } from "../review/types";

const schema = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  repo_root TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  side TEXT NOT NULL DEFAULT 'new',
  original_line INTEGER NOT NULL DEFAULT 0,
  line_end INTEGER NOT NULL DEFAULT 0,
  current_line INTEGER NOT NULL DEFAULT 0,
  anchor_content TEXT NOT NULL DEFAULT '',
  context_before TEXT NOT NULL DEFAULT '',
  context_after TEXT NOT NULL DEFAULT '',
  is_outdated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_threads_session ON threads(session_id);
CREATE INDEX IF NOT EXISTS idx_threads_file ON threads(file_path);
CREATE INDEX IF NOT EXISTS idx_comments_thread ON comments(thread_id);
`;

export class Store {
  readonly db: Database;

  private constructor(db: Database) {
    this.db = db;
  }

  static open(repoRoot: string): Store {
    const dir = path.join(repoRoot, ".git", "custodian");
    mkdirSync(dir, { recursive: true });
    const dbPath = path.join(dir, "review.db");
    const db = new Database(dbPath, { create: true, strict: true });
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(schema);
    return new Store(db);
  }

  close(): void {
    this.db.close();
  }

  createSession(repoRoot: string): ReviewSession {
    const now = new Date();
    const session: ReviewSession = {
      id: crypto.randomUUID(),
      repoRoot,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    this.db.query("UPDATE sessions SET active = 0 WHERE active = 1").run();
    this.db
      .query(
        "INSERT INTO sessions (id, repo_root, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      )
      .run(session.id, session.repoRoot, now.toISOString(), now.toISOString());

    return session;
  }

  activeSession(): ReviewSession | null {
    const row = this.db
      .query("SELECT id, repo_root, created_at, updated_at FROM sessions WHERE active = 1 ORDER BY created_at DESC LIMIT 1")
      .get() as
      | {
          id: string;
          repo_root: string;
          created_at: string;
          updated_at: string;
        }
      | null;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      repoRoot: row.repo_root,
      active: true,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  clearSession(id: string): void {
    this.db.query("DELETE FROM sessions WHERE id = ?").run(id);
  }

  createThread(input: NewThread): Thread {
    const now = new Date();
    const thread: Thread = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      filePath: input.filePath,
      side: input.side,
      originalLine: input.originalLine,
      lineEnd: input.lineEnd,
      currentLine: input.currentLine,
      anchorContent: input.anchorContent,
      contextBefore: input.contextBefore,
      contextAfter: input.contextAfter,
      isOutdated: input.isOutdated ?? false,
      status: input.status ?? ThreadOpen,
      createdAt: now,
      updatedAt: now,
      commentCount: 0,
      firstComment: "",
    };

    this.db
      .query(
        `INSERT INTO threads (
          id, session_id, file_path, side, original_line, line_end,
          current_line, anchor_content, context_before, context_after,
          is_outdated, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        thread.id,
        thread.sessionId,
        thread.filePath,
        thread.side,
        thread.originalLine,
        thread.lineEnd,
        thread.currentLine,
        thread.anchorContent,
        thread.contextBefore,
        thread.contextAfter,
        thread.isOutdated ? 1 : 0,
        thread.status,
        now.toISOString(),
        now.toISOString(),
      );

    return thread;
  }

  listThreads(sessionId: string, filePath = ""): Thread[] {
    const query = `
      SELECT t.id, t.session_id, t.file_path, t.side,
        t.original_line, t.line_end, t.current_line,
        t.anchor_content, t.context_before, t.context_after,
        t.is_outdated, t.status, t.created_at, t.updated_at,
        COALESCE((SELECT COUNT(*) FROM comments WHERE thread_id = t.id), 0) AS comment_count,
        COALESCE((SELECT body FROM comments WHERE thread_id = t.id ORDER BY created_at LIMIT 1), '') AS first_comment
      FROM threads t
      WHERE t.session_id = ? ${filePath ? "AND t.file_path = ?" : ""}
      ORDER BY t.file_path, t.original_line
    `;

    const rows = (filePath
      ? this.db.query(query).all(sessionId, filePath)
      : this.db.query(query).all(sessionId)) as ThreadRow[];

    return rows.map(mapThread);
  }

  threadCountsByFile(sessionId: string): Record<string, number> {
    const rows = this.db
      .query("SELECT file_path, COUNT(*) AS count FROM threads WHERE session_id = ? AND status = 'open' GROUP BY file_path")
      .all(sessionId) as Array<{ file_path: string; count: number }>;

    return Object.fromEntries(rows.map((row) => [row.file_path, row.count]));
  }

  updateThreadLine(id: string, currentLine: number, outdated: boolean): void {
    this.db
      .query("UPDATE threads SET current_line = ?, is_outdated = ?, updated_at = ? WHERE id = ?")
      .run(currentLine, outdated ? 1 : 0, new Date().toISOString(), id);
  }

  updateThreadStatus(id: string, status: ThreadStatus): void {
    this.db
      .query("UPDATE threads SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), id);
  }

  deleteThread(id: string): void {
    this.db.query("DELETE FROM threads WHERE id = ?").run(id);
  }

  addComment(input: NewComment): Comment {
    const comment: Comment = {
      id: crypto.randomUUID(),
      threadId: input.threadId,
      author: input.author ?? AuthorHuman,
      body: input.body,
      createdAt: new Date(),
    };

    this.db
      .query("INSERT INTO comments (id, thread_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(comment.id, comment.threadId, comment.author, comment.body, comment.createdAt.toISOString());

    return comment;
  }

  listComments(threadId: string): Comment[] {
    const rows = this.db
      .query("SELECT id, thread_id, author, body, created_at FROM comments WHERE thread_id = ? ORDER BY created_at")
      .all(threadId) as CommentRow[];

    return rows.map(mapComment);
  }

  listCommentsForThreads(threadIds: string[]): Record<string, Comment[]> {
    if (threadIds.length === 0) {
      return {};
    }

    const placeholders = threadIds.map(() => "?").join(", ");
    const rows = this.db
      .query(
        `SELECT id, thread_id, author, body, created_at FROM comments WHERE thread_id IN (${placeholders}) ORDER BY created_at`,
      )
      .all(...threadIds) as CommentRow[];

    const result: Record<string, Comment[]> = {};
    for (const row of rows) {
      const comment = mapComment(row);
      const existing = result[comment.threadId];
      if (existing) {
        existing.push(comment);
      } else {
        result[comment.threadId] = [comment];
      }
    }
    return result;
  }
}

interface ThreadRow {
  id: string;
  session_id: string;
  file_path: string;
  side: string;
  original_line: number;
  line_end: number;
  current_line: number;
  anchor_content: string;
  context_before: string;
  context_after: string;
  is_outdated: number;
  status: string;
  created_at: string;
  updated_at: string;
  comment_count: number;
  first_comment: string;
}

interface CommentRow {
  id: string;
  thread_id: string;
  author: string;
  body: string;
  created_at: string;
}

function mapThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    sessionId: row.session_id,
    filePath: row.file_path,
    side: row.side,
    originalLine: row.original_line,
    lineEnd: row.line_end,
    currentLine: row.current_line,
    anchorContent: row.anchor_content,
    contextBefore: row.context_before,
    contextAfter: row.context_after,
    isOutdated: row.is_outdated !== 0,
    status: row.status as ThreadStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    commentCount: row.comment_count,
    firstComment: row.first_comment,
  };
}

function mapComment(row: CommentRow): Comment {
  return {
    id: row.id,
    threadId: row.thread_id,
    author: row.author as Author,
    body: row.body,
    createdAt: new Date(row.created_at),
  };
}
