import translations from './portal-translations.json';

export type PortalLocale = 'cs' | 'en' | 'uk';

let activeLocale: PortalLocale = 'cs';

export function setPortalLocale(locale: PortalLocale): void {
  activeLocale = locale;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

export function getPortalLocale(): PortalLocale {
  return activeLocale;
}

export function getIntlLocale(): string {
  return activeLocale === 'uk' ? 'uk-UA' : activeLocale === 'en' ? 'en-GB' : 'cs-CZ';
}

export function t(source: string): string {
  if (activeLocale === 'cs') return source;
  const entries = translations[activeLocale] as Record<string, string>;
  return entries[source] || source;
}

export function tf(source: string, values: Record<string, string | number>): string {
  return t(source).replace(/\{([a-zA-Z_]+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder);
}
