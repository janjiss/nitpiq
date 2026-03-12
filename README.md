# nitpiq

Terminal-based code review tool for local git changes. Built with Bun, TypeScript, React (Ink), and the React Compiler.

Inspect uncommitted changes, leave anchored review comments, and expose an MCP server so AI tools can participate as a second reviewer.

Review data is stored locally in `.git/nitpiq/review.db`.

## Prerequisites

- [Bun](https://bun.sh) v1.1+

## Install

```bash
bun install -g nitpiq
```

Or from source:

```bash
git clone <repo-url> && cd nitpiq
bun install
```

## Usage

### TUI

Run inside any git repository:

```bash
nitpiq
```

Or with npx:

```bash
npx nitpiq
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
nitpiq-mcp /path/to/repo
```

Or with npx (useful for MCP client configuration):

```bash
npx nitpiq-mcp /path/to/repo
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

#### MCP Client Configuration

Replace `/path/to/your/repo` with the absolute path to the git repository you want nitpiq to review.

For Cursor, add this to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "nitpiq": {
      "command": "npx",
      "args": ["nitpiq-mcp", "/path/to/your/repo"]
    }
  }
}
```

For OpenCode, add this to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "nitpiq": {
      "type": "local",
      "enabled": true,
      "command": ["npx", "nitpiq-mcp", "/path/to/your/repo"]
    }
  }
}
```

For Claude Code, either add this to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "nitpiq": {
      "command": "npx",
      "args": ["nitpiq-mcp", "/path/to/your/repo"]
    }
  }
}
```

Or add it from the CLI:

```bash
claude mcp add --scope project --transport stdio nitpiq -- npx nitpiq-mcp /path/to/your/repo
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

## Development

```bash
git clone <repo-url> && cd nitpiq
bun install
bun run dev          # run TUI from source
bun run check        # type check
```

## Building & Publishing

Build compiled binaries for all platforms:

```bash
VERSION=0.2.0 bun run build
```

This creates `dist/` with:
- `nitpiq-linux-x64/` -- Linux x64 binary package
- `nitpiq-linux-arm64/` -- Linux arm64 binary package
- `nitpiq-darwin-x64/` -- macOS x64 binary package
- `nitpiq-darwin-arm64/` -- macOS arm64 binary package
- `nitpiq/` -- main package (wrapper + postinstall)

Publish all packages to npm:

```bash
VERSION=0.2.0 bun run build
bun run publish-all          # publish to npm
bun run publish-all -- --dry-run  # preview without publishing
```
