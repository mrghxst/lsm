// Keep in sync with web/src/colors.ts
export const PALETTE = [
  '#4f8cff', // blue
  '#34c77b', // green
  '#f5a623', // amber
  '#ef5563', // red
  '#b06ef7', // purple
  '#3ec8c8', // teal
  '#ff8a5c', // orange
  '#e959b4', // pink
  '#8a94ff', // indigo
  '#9fd63b', // lime
];

export function isValidColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

// Users created before colors existed get a stable palette color from their id.
export function colorFor(user) {
  return isValidColor(user.color) ? user.color : PALETTE[user.id % PALETTE.length];
}
