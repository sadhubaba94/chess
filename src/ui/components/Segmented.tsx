import { useId } from 'react';

interface Option<T extends string | number | null> {
  value: T;
  label: string;
  hint?: string;
}

/** Accessible single-choice group rendered as a segmented control (native radio inputs). */
export function Segmented<T extends string | number | null>({
  legend,
  options,
  value,
  onChange,
  disabled,
  name,
}: {
  legend: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  name?: string;
}) {
  const autoName = useId();
  const groupName = name ?? autoName;
  return (
    <fieldset className="segmented" disabled={disabled}>
      <legend className="segmented__legend">{legend}</legend>
      <div className="segmented__options">
        {options.map((o) => {
          const id = `${groupName}-${String(o.value)}`;
          return (
            <label key={String(o.value)} className="segmented__option" htmlFor={id} title={o.hint}>
              <input
                id={id}
                type="radio"
                name={groupName}
                checked={o.value === value}
                onChange={() => onChange(o.value)}
              />
              <span>{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Toggle({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string }) {
  const id = useId();
  return (
    <div className="toggle">
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>
        <span className="toggle__label">{label}</span>
        {description && <span className="toggle__description">{description}</span>}
      </label>
    </div>
  );
}
