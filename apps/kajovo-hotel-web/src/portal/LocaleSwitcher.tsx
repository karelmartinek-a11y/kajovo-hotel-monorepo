import React from 'react';
import type { PortalLocale } from '@kajovo/shared';

const OPTIONS: Array<{ locale: PortalLocale; label: string }> = [
  { locale: 'cs', label: 'Čeština' },
  { locale: 'en', label: 'English' },
  { locale: 'uk', label: 'Українська' },
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
      aria-pressed={locale === option.locale}
      onClick={() => onSelect(option.locale)}
    >{option.label}</button>)}
  </div>;
}
