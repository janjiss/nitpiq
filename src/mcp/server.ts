import { mkdirSync } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { changes, kindSymbol, openRepoAt, readFile, stage, unstage, type Repo } from "../git/repo";
import { debug, error, initLog } from "../log/log";
import { relocateThreads } from "../review/anchor";
import { AuthorModel, ThreadOpen, ThreadResolved } from "../review/types";
import { Store } from "../store/store";

export function createServer(repo: Repo, store: Store): McpServer {
  const server = new McpServer({ name: "nitpiq", version: "0.6.0" });

  const activeSession = () => store.activeSession() ?? store.createSession(repo.root);

  server.registerTool(
    "review_list_changes",
    {
      description: "List uncommitted file changes in the repository.",
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            changes(repo).map((change) => ({
              path: change.path,
              kind: change.kind,
              symbol: kindSymbol(change.kind),
            })),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    "review_list_threads",
    {
      description: "List review threads, optionally filtered by file and status.",
      inputSchema: {
        file_path: z.string().optional(),
        status: z.enum(["open", "resolved", "all"]).optional(),
      },
    },
    async ({ file_path, status = "open" }) => {
      const session = activeSession();
      let threads = store.listThreads(session.id, file_path ?? "");

      if (file_path) {
        const content = readFile(repo, file_path);
        threads = relocateThreads(threads, content.split("\n"));
        for (const thread of threads) {
          store.updateThreadLine(thread.id, thread.currentLine, thread.isOutdated);
        }
      }

      const filtered = threads.filter((thread) => status === "all" || thread.status === status);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              filtered.map((thread) => ({
                id: thread.id,
                file_path: thread.filePath,
                line: thread.currentLine,
                line_end: thread.lineEnd || undefined,
                status: thread.status,
                is_outdated: thread.isOutdated || undefined,
                comment_count: thread.commentCount,
                first_comment: thread.firstComment,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "review_reply_thread",
    {
      description: "Post a reply comment to an existing review thread.",
      inputSchema: {
        thread_id: z.string(),
        body: z.string(),
      },
    },
    async ({ thread_id, body }) => {
      store.addComment({ threadId: thread_id, author: AuthorModel, body });
      return textResult(`Reply added to thread ${thread_id}`);
    },
  );

  server.registerTool(
    "review_resolve_thread",
    {
      description: "Mark a review thread as resolved.",
      inputSchema: { thread_id: z.string() },
    },
    async ({ thread_id }) => {
      store.updateThreadStatus(thread_id, ThreadResolved);
      return textResult(`Thread ${thread_id} resolved`);
    },
  );

  server.registerTool(
    "review_reopen_thread",
    {
      description: "Reopen a resolved review thread.",
      inputSchema: { thread_id: z.string() },
    },
    async ({ thread_id }) => {
      store.updateThreadStatus(thread_id, ThreadOpen);
      return textResult(`Thread ${thread_id} reopened`);
    },
  );

  server.registerTool(
    "review_apply_edit",
    {
      description: "Write new content to a file in the repository.",
      inputSchema: {
        file_path: z.string(),
        content: z.string(),
      },
    },
    async ({ file_path, content }) => {
      const absolutePath = path.join(repo.root, file_path);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      await Bun.write(absolutePath, content);
      return textResult(`File ${file_path} updated (${content.length} bytes)`);
    },
  );

  server.registerTool(
    "review_stage_file",
    {
      description: "Stage a file with git add.",
      inputSchema: { file_path: z.string() },
    },
    async ({ file_path }) => {
      stage(repo, file_path);
      return textResult(`File ${file_path} staged`);
    },
  );

  server.registerTool(
    "review_unstage_file",
    {
      description: "Unstage a file.",
      inputSchema: { file_path: z.string() },
    },
    async ({ file_path }) => {
      unstage(repo, file_path);
      return textResult(`File ${file_path} unstaged`);
    },
  );

  return server;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export async function serveStdio(repoPath?: string): Promise<void> {
  const repo = openRepoAt(repoPath);
  const store = Store.open(repo.root);
  initLog(repo.root);
  debug("nitpiq-mcp server starting");

  try {
    const server = createServer(repo, store);
    const transport = new StdioServerTransport();
    let cleanedUp = false;
    const cleanup = async () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      store.close();
    };
    const waitForExit = new Promise<void>((resolve) => {
      transport.onclose = () => {
        void cleanup().finally(resolve);
      };
      process.once("SIGINT", () => {
        void cleanup().finally(resolve);
      });
      process.once("SIGTERM", () => {
        void cleanup().finally(resolve);
      });
      process.once("beforeExit", () => {
        void cleanup().finally(resolve);
      });
    });
    await server.connect(transport);
    await waitForExit;
  } catch (cause) {
    error(String(cause));
    throw cause;
  }
}
