# Custodian JS

A Bun + TypeScript clone of the sibling `custodian` project.

It keeps the same local-review model:
- inspect uncommitted git changes in a terminal UI
- leave anchored comments stored in `.git/custodian/review.db`
- expose an MCP server so other AI tools can read threads, reply, edit files, and resolve feedback

## Install

```bash
bun install
```

## Run

Inside any git repository:

```bash
bun run custodian
```

Run the MCP server:

```bash
bun run custodian-mcp -- /path/to/repo
```

## TUI keys

- `j` / `k` move
- `tab` switch panes
- `enter` open file or thread detail
- `c` comment or reply on current thread
- `r` resolve or reopen thread on current line
- `s` stage or unstage selected file
- `f` toggle diff vs full file
- `/` filter files or search the current diff
- `t` toggle thread list
- `q` quit or back

## Check

```bash
bun run check
```

Review data stays local in `.git/custodian/review.db`, matching the original app's storage model.
