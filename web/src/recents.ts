export interface RecentSpace {
  code: string;
  name: string;
  visitedAt: number;
}

const KEY = 'lsm.recentSpaces';

export function getRecents(): RecentSpace[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function rememberSpace(code: string, name: string) {
  const rest = getRecents().filter((r) => r.code !== code);
  const next = [{ code, name, visitedAt: Date.now() }, ...rest].slice(0, 8);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function forgetSpace(code: string) {
  localStorage.setItem(KEY, JSON.stringify(getRecents().filter((r) => r.code !== code)));
}
