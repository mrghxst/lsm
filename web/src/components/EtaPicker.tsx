import { useMemo } from 'react';
import { plusMinutes } from '../util';

export function EtaPicker({ value, onChange }: { value: string; onChange(v: string): void }) {
  const chips = useMemo(
    () => [
      { label: 'Now', eta: 'now' },
      { label: '+15 min', eta: plusMinutes(15) },
      { label: '+30 min', eta: plusMinutes(30) },
      { label: '+1 h', eta: plusMinutes(60) },
    ],
    [],
  );

  return (
    <div className="eta-picker">
      <div className="chips">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            className={`chip${value === c.eta ? ' active' : ''}`}
            onClick={() => onChange(c.eta)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <label className="time-row">
        <span>or at</span>
        <input
          type="time"
          className="input time-input"
          value={value === 'now' ? '' : value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
