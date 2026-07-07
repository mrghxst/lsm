// Keep in sync with web/src/colors.ts — rainbow order
export const PALETTE = [
  '#ef5563', // red
  '#ff8a5c', // orange
  '#f5a623', // amber
  '#9fd63b', // lime
  '#34c77b', // green
  '#3ec8c8', // teal
  '#4f8cff', // blue
  '#8a94ff', // indigo
  '#b06ef7', // purple
  '#e959b4', // pink
];

export function isValidColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

// Users created before colors existed get a stable palette color from their id.
export function colorFor(user) {
  return isValidColor(user.color) ? user.color : PALETTE[user.id % PALETTE.length];
}
