import { serveStdio } from "../mcp/server";

const repoPath = process.argv[2];

try {
  await serveStdio(repoPath);
} catch (error) {
  console.error(`nitpiq-mcp: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
