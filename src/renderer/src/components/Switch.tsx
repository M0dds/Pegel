interface Props {
  checked: boolean;
  label: string;
  onChange(checked: boolean): void;
}

export function Switch({ checked, label, onChange }: Props) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}
