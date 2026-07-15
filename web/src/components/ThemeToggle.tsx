import { useState } from 'react';
import { applyTheme, resolveTheme, type Theme } from '../theme';

// index.html already put the right class on <html> before first paint; this
// only has to stay in step with it and flip it on tap.
export function ThemeToggle({ className = 'icon-btn' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(resolveTheme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      className={className}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
