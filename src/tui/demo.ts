import type { FileChange, Repo } from "../git/repo";
import { AuthorHuman, AuthorModel, ThreadOpen, ThreadResolved, type Comment, type ReviewSession, type Thread } from "../review/types";

export interface DemoFile {
  change: FileChange;
  content: string;
  diff: string;
  threads: Thread[];
  commentsByThread: Record<string, Comment[]>;
}

export interface DemoState {
  repo: Repo;
  session: ReviewSession;
  repoFiles: string[];
  files: DemoFile[];
  threadCounts: Record<string, number>;
  status: string;
  focus: "files" | "diff";
  showFullFile: boolean;
  fileCursor: number;
  diffCursor: number;
}

export function createDemoState(): DemoState {
  const session: ReviewSession = {
    id: "demo-session",
    repoRoot: "/demo/custodian",
    active: true,
    createdAt: new Date("2026-03-09T12:00:00Z"),
    updatedAt: new Date("2026-03-09T12:00:00Z"),
  };

  const checkoutThread: Thread = {
    id: "thread-checkout",
    sessionId: session.id,
    filePath: "src/checkout/applyCoupon.ts",
    side: "new",
    originalLine: 14,
    lineEnd: 14,
    currentLine: 14,
    anchorContent: "  if (!coupon || !cart.total) {",
    contextBefore: "export function applyCoupon(cart: Cart, coupon?: Coupon) {",
    contextAfter: "    return cart;\n  }",
    isOutdated: false,
    status: ThreadOpen,
    createdAt: new Date("2026-03-09T12:00:00Z"),
    updatedAt: new Date("2026-03-09T12:01:00Z"),
    commentCount: 2,
    firstComment: "This early return skips invalid coupon telemetry.",
  };

  const threadsPanel: Thread = {
    id: "thread-layout",
    sessionId: session.id,
    filePath: "src/tui/panels/files.tsx",
    side: "new",
    originalLine: 22,
    lineEnd: 22,
    currentLine: 22,
    anchorContent: "      <Text wrap=\"truncate-end\">{label}</Text>",
    contextBefore: "    <Box flexDirection=\"row\">",
    contextAfter: "    </Box>",
    isOutdated: false,
    status: ThreadResolved,
    createdAt: new Date("2026-03-09T11:20:00Z"),
    updatedAt: new Date("2026-03-09T11:45:00Z"),
    commentCount: 1,
    firstComment: "Looks better with single-line clipping.",
  };

  const checkoutComments: Record<string, Comment[]> = {
    [checkoutThread.id]: [
      {
        id: "comment-1",
        threadId: checkoutThread.id,
        author: AuthorModel,
        body: "This early return skips the `trackCouponApplied` call, so invalid coupons won't appear in analytics. Consider emitting a separate `couponRejected` event before returning.",
        createdAt: new Date("2026-03-09T12:00:00Z"),
      },
      {
        id: "comment-2",
        threadId: checkoutThread.id,
        author: AuthorHuman,
        body: "Good catch — I still want to keep the guard, but I can emit an event before returning.\nI'll add `trackCouponRejected({ code: coupon?.code })` right before the early return.",
        createdAt: new Date("2026-03-09T12:01:00Z"),
      },
      {
        id: "comment-3a",
        threadId: checkoutThread.id,
        author: AuthorModel,
        body: "That sounds good. Make sure to handle the `coupon?.code` being `undefined` gracefully in the telemetry pipeline.",
        createdAt: new Date("2026-03-09T12:02:00Z"),
      },
    ],
  };

  const filesComments: Record<string, Comment[]> = {
    [threadsPanel.id]: [
      {
        id: "comment-3",
        threadId: threadsPanel.id,
        author: AuthorHuman,
        body: "Looks better with single-line clipping.",
        createdAt: new Date("2026-03-09T11:45:00Z"),
      },
    ],
  };

  const checkoutFile: DemoFile = {
    change: {
      path: "src/checkout/applyCoupon.ts",
      oldPath: "",
      kind: "modified",
      staged: false,
      unstaged: true,
    },
    content: [
      "export function applyCoupon(cart: Cart, coupon?: Coupon) {",
      "  if (!coupon || !cart.total) {",
      "    return cart;",
      "  }",
      "",
      "  const nextTotal = Math.max(0, cart.total - coupon.amount);",
      "",
      "  trackCouponApplied({",
      "    code: coupon.code,",
      "    previousTotal: cart.total,",
      "    nextTotal,",
      "  });",
      "",
      "  return { ...cart, total: nextTotal };",
      "}",
    ].join("\n"),
    diff: [
      "diff --git a/src/checkout/applyCoupon.ts b/src/checkout/applyCoupon.ts",
      "index 1234567..89abcde 100644",
      "--- a/src/checkout/applyCoupon.ts",
      "+++ b/src/checkout/applyCoupon.ts",
      "@@ -1,7 +1,14 @@",
      " export function applyCoupon(cart: Cart, coupon?: Coupon) {",
      "-  if (!coupon) {",
      "+  if (!coupon || !cart.total) {",
      "     return cart;",
      "   }",
      " ",
      "+  const nextTotal = Math.max(0, cart.total - coupon.amount);",
      "+",
      "+  trackCouponApplied({",
      "+    code: coupon.code,",
      "+    previousTotal: cart.total,",
      "+    nextTotal,",
      "+  });",
      "-  return { ...cart, total: cart.total - coupon.amount };",
      "+  return { ...cart, total: nextTotal };",
      " }",
    ].join("\n"),
    threads: [checkoutThread],
    commentsByThread: checkoutComments,
  };

  const filesPaneFile: DemoFile = {
    change: {
      path: "src/tui/panels/files.tsx",
      oldPath: "",
      kind: "modified",
      staged: true,
      unstaged: false,
    },
    content: [
      "export function FileRow({ active, label }: Props) {",
      "  return (",
      "    <Box flexDirection=\"row\">",
      "      <Text color={active ? \"blue\" : undefined}>{active ? \">\" : \" \"}</Text>",
      "      <Text wrap=\"truncate-end\">{label}</Text>",
      "    </Box>",
      "  );",
      "}",
    ].join("\n"),
    diff: [
      "diff --git a/src/tui/panels/files.tsx b/src/tui/panels/files.tsx",
      "index abcdef0..1234567 100644",
      "--- a/src/tui/panels/files.tsx",
      "+++ b/src/tui/panels/files.tsx",
      "@@ -2,6 +2,7 @@",
      "   return (",
      "     <Box flexDirection=\"row\">",
      "+      <Text color={active ? \"blue\" : undefined}>{active ? \">\" : \" \"}</Text>",
      "       <Text wrap=\"truncate-end\">{label}</Text>",
      "     </Box>",
      "   );",
    ].join("\n"),
    threads: [threadsPanel],
    commentsByThread: filesComments,
  };

  const readmeFile: DemoFile = {
    change: {
      path: "README.md",
      oldPath: "",
      kind: "added",
      staged: false,
      unstaged: true,
    },
    content: "# Custodian Demo\n\nTerminal review UI snapshot mode.",
    diff: [
      "diff --git a/README.md b/README.md",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/README.md",
      "@@ -0,0 +1,3 @@",
      "+# Custodian Demo",
      "+",
      "+Terminal review UI snapshot mode.",
    ].join("\n"),
    threads: [],
    commentsByThread: {},
  };

  const files = [checkoutFile, filesPaneFile, readmeFile];

  return {
    repo: {
      root: "/demo/custodian",
      name: "custodian-demo",
      hasHead: true,
    },
    session,
    repoFiles: files.map((file) => file.change.path),
    files,
    threadCounts: {
      "src/checkout/applyCoupon.ts": 1,
      "src/tui/panels/files.tsx": 0,
    },
    status: "Demo mode - fixed data for UI snapshots",
    focus: "diff",
    showFullFile: false,
    fileCursor: 0,
    diffCursor: 18,
  };
}
