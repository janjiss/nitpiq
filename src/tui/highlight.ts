import pc from "picocolors";
import { fg, type RGB, type Theme } from "./theme";

interface SyntaxColors {
  keyword: RGB;
  string: RGB;
  comment: RGB;
  number: RGB;
  type: RGB;
  fn: RGB;
  property: RGB;
  punctuation: RGB;
}

const palettes: Record<string, SyntaxColors> = {
  dark: {
    keyword: [198, 120, 221],
    string: [152, 195, 121],
    comment: [92, 99, 112],
    number: [209, 154, 102],
    type: [86, 182, 194],
    fn: [97, 175, 239],
    property: [171, 178, 191],
    punctuation: [140, 140, 140],
  },
  catppuccin: {
    keyword: [203, 166, 247],
    string: [166, 227, 161],
    comment: [108, 112, 134],
    number: [250, 179, 135],
    type: [148, 226, 213],
    fn: [137, 180, 250],
    property: [205, 214, 244],
    punctuation: [147, 153, 178],
  },
  nord: {
    keyword: [180, 142, 173],
    string: [163, 190, 140],
    comment: [76, 86, 106],
    number: [208, 135, 112],
    type: [143, 188, 187],
    fn: [136, 192, 208],
    property: [216, 222, 233],
    punctuation: [178, 184, 196],
  },
  gruvbox: {
    keyword: [211, 134, 155],
    string: [184, 187, 38],
    comment: [146, 131, 116],
    number: [254, 128, 25],
    type: [131, 165, 152],
    fn: [131, 165, 152],
    property: [235, 219, 178],
    punctuation: [168, 153, 132],
  },
};

const KEYWORDS = new Set([
  "if", "else", "elif", "for", "while", "do", "switch", "case", "match",
  "break", "continue", "return", "yield", "try", "catch", "except",
  "finally", "throw", "raise", "default", "when",
  "const", "let", "var", "function", "fn", "func", "def", "class", "struct",
  "enum", "type", "interface", "trait", "impl", "module", "mod", "package",
  "namespace", "import", "export", "from", "use", "require", "include",
  "extends", "implements", "abstract", "override",
  "new", "delete", "typeof", "instanceof", "in", "of", "is", "as",
  "async", "await", "static", "readonly", "mut", "pub", "private",
  "protected", "public", "extern", "unsafe", "declare",
  "and", "or", "not", "with", "defer", "go", "select", "chan", "range",
  "true", "false", "null", "nil", "None", "undefined", "void",
  "self", "this", "super", "Self",
  "lambda", "pass", "begin", "end", "rescue", "ensure", "loop",
  "move", "ref", "where", "dyn", "crate", "goto",
]);

function getSyntax(theme: Theme): SyntaxColors {
  return palettes[theme.name] ?? palettes["dark"]!;
}

const cache = new Map<string, string>();
let cacheTheme = "";

export function clearHighlightCache(): void {
  cache.clear();
  cacheTheme = "";
}

export function highlightLine(line: string, theme: Theme): string {
  if (theme.name !== cacheTheme) {
    cache.clear();
    cacheTheme = theme.name;
  }
  const cached = cache.get(line);
  if (cached !== undefined) return cached;
  const s = getSyntax(theme);
  let out = "";
  let pos = 0;
  const len = line.length;

  while (pos < len) {
    const ch = line[pos]!;

    // Line comments: // or --
    if ((ch === "/" && line[pos + 1] === "/") || (ch === "-" && line[pos + 1] === "-")) {
      out += fg(s.comment, line.slice(pos));
      return out;
    }
    // Hash comments (only at start-of-content or after whitespace)
    if (ch === "#" && (pos === 0 || line[pos - 1] === " " || line[pos - 1] === "\t")) {
      out += fg(s.comment, line.slice(pos));
      return out;
    }

    // Block comment within a line: /* ... */
    if (ch === "/" && line[pos + 1] === "*") {
      const close = line.indexOf("*/", pos + 2);
      if (close >= 0) {
        out += fg(s.comment, line.slice(pos, close + 2));
        pos = close + 2;
        continue;
      }
      out += fg(s.comment, line.slice(pos));
      return out;
    }

    // Strings: "...", '...', `...`
    if (ch === '"' || ch === "'" || ch === "`") {
      let end = pos + 1;
      while (end < len) {
        if (line[end] === "\\") { end += 2; continue; }
        if (line[end] === ch) { end++; break; }
        end++;
      }
      out += fg(s.string, line.slice(pos, end));
      pos = end;
      continue;
    }

    // Numbers (not preceded by a letter/underscore)
    if (/\d/.test(ch) && (pos === 0 || !/[a-zA-Z_$]/.test(line[pos - 1] ?? ""))) {
      let end = pos;
      if (ch === "0" && pos + 1 < len && /[xXbBoO]/.test(line[pos + 1]!)) {
        end += 2;
        while (end < len && /[0-9a-fA-F_]/.test(line[end]!)) end++;
      } else {
        while (end < len && /[0-9_]/.test(line[end]!)) end++;
        if (end < len && line[end] === ".") {
          end++;
          while (end < len && /[0-9_]/.test(line[end]!)) end++;
        }
        if (end < len && /[eE]/.test(line[end]!)) {
          end++;
          if (end < len && /[+\-]/.test(line[end]!)) end++;
          while (end < len && /[0-9_]/.test(line[end]!)) end++;
        }
      }
      out += fg(s.number, line.slice(pos, end));
      pos = end;
      continue;
    }

    // Words: identifiers, keywords, types, function calls, decorators
    if (/[a-zA-Z_$@]/.test(ch)) {
      let end = pos;
      const isDecorator = ch === "@";
      if (isDecorator) end++;
      while (end < len && /[a-zA-Z0-9_$]/.test(line[end]!)) end++;
      const word = line.slice(pos, end);
      const bare = isDecorator ? word.slice(1) : word;

      if (isDecorator) {
        out += fg(s.keyword, word);
      } else if (KEYWORDS.has(bare)) {
        out += fg(s.keyword, word);
      } else if (/^[A-Z][a-zA-Z0-9]*$/.test(bare) && bare.length > 1) {
        out += fg(s.type, word);
      } else if (end < len && line[end] === "(") {
        out += fg(s.fn, word);
      } else {
        out += word;
      }
      pos = end;
      continue;
    }

    // Punctuation
    if (/[()[\]{},;.]/.test(ch)) {
      out += fg(s.punctuation, ch);
      pos++;
      continue;
    }

    // Everything else (operators, whitespace) pass through
    out += ch;
    pos++;
  }

  cache.set(line, out);
  return out;
}

export function renderMarkdown(text: string, theme: Theme): string {
  let result = text;
  result = result.replace(/`([^`]+)`/g, (_, c: string) => fg(theme.accent, c));
  result = result.replace(/\*\*(.+?)\*\*/g, (_, b: string) => pc.bold(b));
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, i: string) => pc.italic(i));
  return result;
}
