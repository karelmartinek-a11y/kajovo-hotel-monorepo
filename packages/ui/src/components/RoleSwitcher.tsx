import React from 'react';

type RoleSwitcherItem = {
  key: string;
  label: string;
};

type RoleSwitcherProps = {
  activeLabel: string;
  alternatives: RoleSwitcherItem[];
  busy?: boolean;
  ariaLabel?: string;
  onSelect: (key: string) => void;
};

export function RoleSwitcher({
  activeLabel,
  alternatives,
  busy = false,
  ariaLabel = 'Přepínač rolí',
  onSelect,
}: RoleSwitcherProps): JSX.Element | null {
  if (alternatives.length === 0) {
    return null;
  }

  return (
    <div className="k-role-switcher" aria-label={ariaLabel}>
      <span className="k-role-switcher__active">{activeLabel}</span>
      {alternatives.map((item) => (
        <button
          key={item.key}
          className="k-role-switcher__button"
          type="button"
          disabled={busy}
          onClick={() => onSelect(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
