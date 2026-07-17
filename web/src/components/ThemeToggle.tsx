import { useState } from 'react';
import { applyTheme, resolveTheme, type Theme } from '../theme';
import { MoonIcon, SunIcon } from './Icons';

// index.html already put the right class on <html> before first paint; this
// only has to stay in step with it and flip it on tap.
export function ThemeToggle({
  className = 'icon-btn',
  withLabel = false,
}: {
  className?: string;
  withLabel?: boolean;
}) {
  const [theme, setTheme] = useState<Theme>(resolveTheme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const glyph = theme === 'dark' ? <SunIcon /> : <MoonIcon />;
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
      {withLabel ? (
        <>
          <span className="bar-btn-glyph">{glyph}</span>
          <span className="bar-btn-label">{next === 'dark' ? 'Dark mode' : 'Light mode'}</span>
        </>
      ) : (
        glyph
      )}
    </button>
  );
}
