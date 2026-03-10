export type RGB = readonly [number, number, number];

export interface Theme {
  name: string;
  border: string;
  borderFocus: string;
  cursor: RGB;
  selection: RGB;
  accent: RGB;
  add: RGB;
  addBg: RGB;
  del: RGB;
  delBg: RGB;
  hunk: RGB;
  thread: RGB;
  threadBg: RGB;
  staged: RGB;
  warning: RGB;
}

const dark: Theme = {
  name: "dark",
  border: "gray",
  borderFocus: "blue",
  cursor: [25, 35, 55],
  selection: [20, 55, 110],
  accent: [70, 130, 255],
  add: [80, 200, 80],
  addBg: [18, 30, 18],
  del: [240, 80, 80],
  delBg: [40, 18, 18],
  hunk: [80, 180, 220],
  thread: [180, 120, 220],
  threadBg: [28, 22, 38],
  staged: [80, 200, 80],
  warning: [230, 180, 50],
};

const catppuccin: Theme = {
  name: "catppuccin",
  border: "#585b70",
  borderFocus: "#89b4fa",
  cursor: [49, 50, 68],
  selection: [69, 71, 90],
  accent: [137, 180, 250],
  add: [166, 227, 161],
  addBg: [33, 40, 35],
  del: [243, 139, 168],
  delBg: [43, 30, 35],
  hunk: [137, 220, 235],
  thread: [203, 166, 247],
  threadBg: [35, 28, 45],
  staged: [166, 227, 161],
  warning: [249, 226, 175],
};

const nord: Theme = {
  name: "nord",
  border: "#4c566a",
  borderFocus: "#88c0d0",
  cursor: [55, 62, 77],
  selection: [67, 76, 94],
  accent: [136, 192, 208],
  add: [163, 190, 140],
  addBg: [48, 56, 50],
  del: [191, 97, 106],
  delBg: [55, 48, 50],
  hunk: [136, 192, 208],
  thread: [180, 142, 173],
  threadBg: [42, 38, 48],
  staged: [163, 190, 140],
  warning: [235, 203, 139],
};

const gruvbox: Theme = {
  name: "gruvbox",
  border: "#504945",
  borderFocus: "#d79921",
  cursor: [60, 56, 54],
  selection: [80, 73, 69],
  accent: [215, 153, 33],
  add: [184, 187, 38],
  addBg: [42, 42, 28],
  del: [251, 73, 52],
  delBg: [50, 32, 30],
  hunk: [131, 165, 152],
  thread: [211, 134, 155],
  threadBg: [42, 30, 34],
  staged: [184, 187, 38],
  warning: [250, 189, 47],
};

export const themes: Record<string, Theme> = { dark, catppuccin, nord, gruvbox };
export const themeNames = Object.keys(themes);

export function getTheme(name?: string): Theme {
  if (name && name in themes) return themes[name]!;
  return dark;
}

export function bg(rgb: RGB, text: string): string {
  return `\u001b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\u001b[49m`;
}

export function fg(rgb: RGB, text: string): string {
  return `\u001b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\u001b[39m`;
}
