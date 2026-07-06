export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  small = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(v: number): void;
  small?: boolean;
}) {
  return (
    <div className={`stepper${small ? ' stepper-sm' : ''}`}>
      <span className="stepper-label">{label}</span>
      <div className="stepper-controls">
        <button type="button" className="stepper-btn" onClick={() => onChange(value - 1)} disabled={value <= min}>
          −
        </button>
        <span className="stepper-value">{value}</span>
        <button type="button" className="stepper-btn" onClick={() => onChange(value + 1)} disabled={value >= max}>
          +
        </button>
      </div>
    </div>
  );
}
