// Light is the default look; dark is a per-device preference. An unset
// preference follows the OS, so the app matches the phone's own appearance
// until the user overrides it here. The same resolution runs inline in
// index.html before first paint — keep the two in sync.

const KEY = 'lsm-theme';

export type Theme = 'light' | 'dark';

const BAR_COLOR: Record<Theme, string> = { light: '#f7f6f3', dark: '#0b0e13' };

export function resolveTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // private mode / storage disabled — fall through to the OS preference
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[theme]);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // preference just won't persist; the current page still switches
  }
}
