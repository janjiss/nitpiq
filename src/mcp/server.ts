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
  const server = new McpServer(
    { name: "nitpiq", version: "0.7.0" },
    {
      instructions:
        "nitpiq is a local code review MCP server for reviewing uncommitted git changes. " +
        "Use these tools when the user wants to review local changes, inspect nitpiq review threads, reply to feedback, resolve comments, apply edits from review, or stage reviewed files. " +
        "Prefer nitpiq tools for local review workflows over generic repository inspection when the request is about reviewing or managing feedback on local changes.",
    },
  );

  const activeSession = () => store.activeSession() ?? store.createSession(repo.root);

  server.registerTool(
    "review_list_changes",
    {
      title: "Nitpiq List Changes",
      description: "Use for nitpiq code review. Lists local uncommitted git changes that should be reviewed.",
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
      title: "Nitpiq List Threads",
      description:
        "Use for nitpiq review workflow. Lists nitpiq review threads, optionally filtered by file and thread status.",
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
      title: "Nitpiq Reply Thread",
      description: "Use for nitpiq review workflow. Posts a reply to an existing nitpiq review thread.",
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
      title: "Nitpiq Resolve Thread",
      description: "Use for nitpiq review workflow. Marks a nitpiq review thread as resolved.",
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
      title: "Nitpiq Reopen Thread",
      description: "Use for nitpiq review workflow. Reopens a resolved nitpiq review thread.",
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
      title: "Nitpiq Apply Edit",
      description: "Use when addressing nitpiq review feedback. Writes updated content to a file in the reviewed repository.",
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
      title: "Nitpiq Stage File",
      description: "Use after nitpiq review. Stages a reviewed file with git add.",
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
      title: "Nitpiq Unstage File",
      description: "Use in nitpiq review workflow. Removes a file from the git staging area.",
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
