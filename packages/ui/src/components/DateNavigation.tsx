import React from 'react';
import { getIntlLocale, t } from '@kajovo/shared';

const PRAGUE_TIME_ZONE = 'Europe/Prague';

export function hotelToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRAGUE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(getIntlLocale(), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

export function DateNavigation({ value, onChange, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}): JSX.Element {
  return <div className="k-hk-datebar">
    <button type="button" disabled={disabled} onClick={() => onChange(shiftDate(value, -1))} aria-label={t('Předchozí den')}>‹</button>
    <label>
      <span aria-hidden="true">▣</span>
      <input type="date" disabled={disabled} value={value} onChange={(event) => { if (event.target.value) onChange(event.target.value); }} aria-label={t('Vybraný den')} />
      <strong>{formatDate(value)}</strong>
    </label>
    <button type="button" disabled={disabled} onClick={() => onChange(shiftDate(value, 1))} aria-label={t('Následující den')}>›</button>
    <button className="k-hk-datebar__today" type="button" disabled={disabled} onClick={() => onChange(hotelToday())}>{t('Dnes')}</button>
  </div>;
}
