# Custodian JS

Terminal-based code review tool for local git changes. Built with Bun, TypeScript, React (Ink), and the React Compiler.

Inspect uncommitted changes, leave anchored review comments, and expose an MCP server so AI tools can participate as a second reviewer.

Review data is stored locally in `.git/custodian/review.db`.

## Prerequisites

- [Bun](https://bun.sh) v1.1+

## Setup

```bash
git clone <repo-url> && cd custodian-js
bun install
```

## Usage

### TUI

Run inside any git repository:

```bash
bun run custodian
```

Options:

```
--theme=<name>   Set color theme (dark, catppuccin, nord, gruvbox)
--demo           Launch with fixed demo data (no git required)
--snapshot        Render a single frame and exit (for screenshots)
```

### MCP Server

Start the MCP server for AI tool integration:

```bash
bun run custodian-mcp -- /path/to/repo
```

The server exposes these tools over stdio:

| Tool | Description |
|------|-------------|
| `review_list_changes` | List uncommitted file changes |
| `review_list_threads` | List review threads (filterable by file/status) |
| `review_reply_thread` | Add a reply to a thread |
| `review_resolve_thread` | Mark a thread as resolved |
| `review_reopen_thread` | Reopen a resolved thread |
| `review_apply_edit` | Write content to a file |
| `review_stage_file` | Stage a file |
| `review_unstage_file` | Unstage a file |

To use with an MCP-compatible client, point it at:

```bash
bun run src/cli/custodian-mcp.ts /path/to/repo
```

## Keybindings

### File Sidebar

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate files |
| `l` / `Enter` | Open file in diff pane |
| `/` | Filter files by name |
| `s` | Stage / unstage file |
| `f` | Toggle between git changes and all files |
| `r` | Refresh |
| `Tab` | Switch to diff pane |
| `q` | Quit |

### Diff Pane

**Navigation (vim-style, supports count prefix e.g. `5j`):**

| Key | Action |
|-----|--------|
| `j` / `k` | Line up / down |
| `gg` | Jump to top (or `[count]gg` to line N) |
| `G` | Jump to bottom (or `[count]G` to line N) |
| `Ctrl+D` / `Ctrl+U` | Half-page down / up |
| `Ctrl+F` / `Ctrl+B` | Full-page down / up |
| `H` / `M` / `L` | Top / middle / bottom of visible screen |
| `{` / `}` | Previous / next block (hunk headers, blank lines) |
| `w` / `b` | Next / previous changed line |
| `[` / `]` | Previous / next review thread (cross-file) |
| `zz` / `zt` / `zb` | Center / top / bottom current line on screen |
| `:` | Go to line number |

**Actions:**

| Key | Action |
|-----|--------|
| `c` | Comment on current line (or reply if thread exists) |
| `v` | Enter visual mode for range selection |
| `d` | Delete thread at cursor (with confirmation) |
| `r` | Resolve / reopen thread at cursor |
| `/` | Search diff |
| `n` / `N` | Next / previous search match |
| `f` | Toggle diff view / full file view |
| `e` | Cycle diff context (3 / 10 / full) |
| `h` / `Esc` / `q` | Back to file sidebar |

### Visual Mode

| Key | Action |
|-----|--------|
| `j` / `k` | Extend selection |
| `c` | Comment on selected range |
| `Esc` | Cancel |

## Themes

Set with `--theme=<name>`:

- **dark** (default) -- blue accent on dark background
- **catppuccin** -- pastel mocha palette
- **nord** -- arctic blue tones
- **gruvbox** -- warm retro colors

## Type Check

```bash
bun run check
```
