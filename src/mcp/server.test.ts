import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, test } from "bun:test";

describe("nitpiq MCP server", () => {
  test("keeps the store open after connect", async () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "nitpiq-mcp-"));
    await Bun.write(path.join(repoRoot, "file.ts"), "export const value = 1;\n");

    Bun.spawnSync(["git", "init"], { cwd: repoRoot, stdout: "ignore", stderr: "ignore" });

    const dbDir = path.join(repoRoot, ".git", "nitpiq");
    mkdirSync(dbDir, { recursive: true });

    const client = new Client({ name: "nitpiq-test", version: "0.0.0" }, { capabilities: {} });
    const transport = new StdioClientTransport({
      command: "bun",
      args: ["run", path.join(process.cwd(), "src/cli/nitpiq-mcp.ts"), repoRoot],
      cwd: process.cwd(),
      stderr: "pipe",
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "review_list_threads",
      arguments: { status: "open" },
    });

    expect(result.isError).not.toBeTrue();

    await transport.close();
  });
});
