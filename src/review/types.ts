export type ThreadStatus = "open" | "resolved";

export const ThreadOpen: ThreadStatus = "open";
export const ThreadResolved: ThreadStatus = "resolved";

export type Author = "human" | "model";

export const AuthorHuman: Author = "human";
export const AuthorModel: Author = "model";

export interface ReviewSession {
  id: string;
  repoRoot: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Thread {
  id: string;
  sessionId: string;
  filePath: string;
  side: string;
  originalLine: number;
  lineEnd: number;
  currentLine: number;
  anchorContent: string;
  contextBefore: string;
  contextAfter: string;
  isOutdated: boolean;
  status: ThreadStatus;
  createdAt: Date;
  updatedAt: Date;
  commentCount: number;
  firstComment: string;
}

export interface Comment {
  id: string;
  threadId: string;
  author: Author;
  body: string;
  createdAt: Date;
}

export interface NewThread {
  sessionId: string;
  filePath: string;
  side: string;
  originalLine: number;
  lineEnd: number;
  currentLine: number;
  anchorContent: string;
  contextBefore: string;
  contextAfter: string;
  isOutdated?: boolean;
  status?: ThreadStatus;
}

export interface NewComment {
  threadId: string;
  author: Author;
  body: string;
}
