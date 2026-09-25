import React from 'react';
import type { PortalLocale } from '@kajovo/shared';

const OPTIONS: Array<{ locale: PortalLocale; label: string; flag: string }> = [
  { locale: 'cs', label: 'Čeština', flag: '🇨🇿' },
  { locale: 'en', label: 'English', flag: '🇬🇧' },
  { locale: 'uk', label: 'Українська', flag: '🇺🇦' },
];

export function LocaleSwitcher({ locale, onSelect, busy = false }: {
  locale: PortalLocale;
  onSelect: (locale: PortalLocale) => void;
  busy?: boolean;
}): JSX.Element {
  return <div className="k-locale-switcher" role="group" aria-label="Jazyk / Language / Мова">
    {OPTIONS.map((option) => <button
      key={option.locale} type="button" disabled={busy}
      className="k-locale-switcher__option" lang={option.locale}
      aria-label={option.label}
      aria-pressed={locale === option.locale}
      onClick={() => onSelect(option.locale)}
    ><span className="k-locale-switcher__flag" aria-hidden="true">{option.flag}</span><span className="k-locale-switcher__label">{option.label}</span></button>)}
  </div>;
}
