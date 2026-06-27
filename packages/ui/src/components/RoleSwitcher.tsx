import React from 'react';
import { Icon } from './Icon';

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
    <div className="k-role-switcher" role="group" aria-label={ariaLabel}>
      <span className="k-role-switcher__active">
        <Icon name="profile" className="k-role-switcher__icon" />
        <span>{activeLabel}</span>
      </span>
      {alternatives.map((item) => (
        <button
          key={item.key}
          className="k-role-switcher__button"
          type="button"
          disabled={busy}
          aria-label={`Přepnout roli na ${item.label}`}
          onClick={() => onSelect(item.key)}
        >
          <Icon name="grid" className="k-role-switcher__icon" />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
