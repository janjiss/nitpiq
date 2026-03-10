import React from "react";
import { render } from "ink";
import { openRepoAt } from "../git/repo";
import { initLog } from "../log/log";
import { Store } from "../store/store";
import { CustodianApp } from "../tui/app";
import { createDemoState } from "../tui/demo";

try {
  const args = process.argv.slice(2);
  const demo = args.includes("--demo");
  const snapshot = args.includes("--snapshot");
  const themeArg = args.find((a) => a.startsWith("--theme="));
  const themeName = themeArg?.split("=")[1];
  const demoState = demo ? createDemoState() : undefined;
  const repo = demoState?.repo ?? openRepoAt(process.cwd());
  const store = demo ? null : Store.open(repo.root);
  if (!demo) {
    initLog(repo.root);
  }
  const useAltScreen = Boolean(process.stdout.isTTY);
  if (useAltScreen) {
    process.stdout.write("\u001b[?1049h\u001b[H");
  }

  const instance = render(<CustodianApp repo={repo} store={store} demoState={demoState} snapshot={snapshot} theme={themeName} />);
  instance.waitUntilExit().finally(() => {
    if (useAltScreen) {
      process.stdout.write("\u001b[?1049l");
    }
    store?.close();
  });
} catch (error) {
  console.error(`custodian: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
