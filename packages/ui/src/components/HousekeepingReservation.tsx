import React from 'react';
import * as countryFlags from 'country-flag-icons/react/3x2';
import { getIntlLocale, t, type HousekeepingStayRead, type ReservationAmenityKind } from '@kajovo/shared';

export type StayKind = 'departure' | 'arrival' | 'stay';
export const RESERVATION_LABELS = { confirmed: 'Potvrzeno', checked_in: 'CHECK-IN', checked_out: 'CHECK-OUT', option: 'Opce' };

export function countryName(code?: string | null, fallback?: string | null): string {
  if (!code) return fallback || '?';
  try { return new Intl.DisplayNames([getIntlLocale()], { type: 'region' }).of(code) ?? '?'; }
  catch { return '?'; }
}

export function reservationNightProgress(stay: HousekeepingStayRead, date: string): string {
  const day = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) / 86_400_000 : NaN;
  const arrival = day(stay.arrival), departure = day(stay.departure), selected = day(date);
  const total = departure - arrival;
  return Number.isInteger(total) && total >= 0 && Number.isFinite(selected)
    ? `${Math.min(total, Math.max(0, selected - arrival))}/${total}` : '?/?';
}

const numberWidth = (value: string | number): React.CSSProperties => ({ '--k-hk-number-length': String(value).length } as React.CSSProperties);

function PersonIcon({ kind }: { kind: 'adults' | 'children' | 'infants' }): JSX.Element {
  return <svg className={`k-hk-person-icon k-hk-person-icon--${kind}`} viewBox="0 0 16 24" aria-hidden="true">
    {kind === 'adults' ? <><circle cx="8" cy="3.2" r="2.7" /><path d="M5.6 7h4.8c1.5 0 2.5 1.1 2.8 2.6l1.3 6-2 .5-1.3-5.2v11.6H8.9v-7H7.1v7H4.8V10.9l-1.3 5.2-2-.5 1.3-6C3.1 8.1 4.1 7 5.6 7Z" /></>
      : kind === 'children' ? <><circle cx="8" cy="7" r="3" /><path d="M5.9 11h4.2c1 0 1.6.5 2.2 1.5l2.5 4.2-1.7 1-2.3-3.7v8.5H8.9v-5H7.1v5H5.2V14l-2.3 3.7-1.7-1 2.5-4.2C4.3 11.5 4.9 11 5.9 11Z" /></>
      : <><path d="M7 1.2c-1.5-.9-2.8.3-1.8 1.3.5.4 1.2.2 1.7 0 .6-.3 1.4-.2 1.9.2C8.7 2 8 1.5 7 1.2Z" /><circle cx="8" cy="6.5" r="3.5" /><path fillRule="evenodd" d="M4.1 10.7c-1.5 1-2.1 2.8-1.5 4.8.7 2.4 2.7 4.9 5.4 7.1 2.7-2.2 4.7-4.7 5.4-7.1.6-2 0-3.8-1.5-4.8H4.1Zm1.2 2.1 5.9 4.4.8-1.3-5.9-4.4-.8 1.3Zm-.7 4.5 3.4 2.6 1.2-1.2-3.7-2.7-.9 1.3Z" /></>}
  </svg>;
}

export function PersonCounts({ stay }: { stay: HousekeepingStayRead }): JSX.Element {
  return <span className="k-hk-person-counts">
    {(['adults', 'children', 'infants'] as const).map((kind) => <span key={kind} data-age-group={kind} style={numberWidth(stay[kind] ?? '?')} title={`${t(kind === 'adults' ? 'Dospělí' : kind === 'children' ? 'Děti 2–17 let' : 'Mimina do 2 let')}: ${stay[kind] ?? '?'}`}>
      <PersonIcon kind={kind} /><b>{stay[kind] ?? '?'}</b>
    </span>)}
  </span>;
}

export function requirementConfirmed(stay: HousekeepingStayRead, kind: ReservationAmenityKind): boolean {
  return (stay.amenities ?? []).some((item) => item.kind === kind && item.active && item.state === 'green');
}

function RequestIcon({ kind, confirmed }: { kind: ReservationAmenityKind; confirmed: boolean }): JSX.Element {
  const color = confirmed ? '#22a55c' : '#e84848';
  const cot = 'M3 4v16m18-16v16M3 7h18M3 17h18M3 14h18M7.5 7v7M12 7v7M16.5 7v7';
  return <svg className="k-hk-request-icon" data-request-kind={kind} data-request-state={confirmed ? 'green' : 'red'} viewBox="0 0 24 24" aria-hidden="true">
    {kind === 'dog' ? <path fill={color} stroke="#111" strokeWidth=".7" strokeLinejoin="round" fillRule="evenodd" d="M4.8 10.1c-1.6-.3-2.2-1.2-2.3-2.9L.7 7.5c.2 2.7 1.4 4.4 3.6 4.8v7.9c0 .6.4 1 1 1h1.4v-5h6.2v5h2.4v-8.5l2.2-1.3h2.8c.8 0 1.4-.5 1.7-1.2l.9-2.4c.1-.4-.1-.8-.5-.9l-3.2-1.1-1.5-2.6c-.3-.5-.9-.6-1.3-.2L14 5.3l-1 4.8H4.8Zm12-3.2a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
      : <g fill="none" strokeLinecap="round" strokeLinejoin="round"><path d={cot} stroke="#111" strokeWidth="2.8" /><path d={cot} stroke={color} strokeWidth="1.8" /></g>}
  </svg>;
}

export function ReservationRequests({ stay, compact = false }: { stay: HousekeepingStayRead; compact?: boolean }): JSX.Element {
  const dogs = stay.dog_count;
  if (compact) return <span className="k-hk-requests k-hk-requests--compact">
    <span className="k-hk-requests__dog" title={`${t('Pes')}: ${dogs ?? '?'}`}>
      {dogs == null ? <b className="k-hk-request-unknown">?</b> : dogs > 0 ? <span className="k-hk-request-badge"><RequestIcon kind="dog" confirmed={requirementConfirmed(stay, 'dog')} /><b style={numberWidth(`×${dogs}`)}>×{dogs}</b></span> : null}
    </span>
    <span className="k-hk-requests__cot" title={`${t('Dětská postýlka')}: ${stay.cot_required == null ? '?' : stay.cot_required ? 1 : 0}`}>
      {stay.cot_required == null ? <b className="k-hk-request-unknown">?</b> : stay.cot_required ? <RequestIcon kind="cot" confirmed={requirementConfirmed(stay, 'cot')} /> : null}
    </span>
    <span className="k-hk-requests__note">{stay.housekeeping_note?.trim() ? <span className="k-hk-room__note-alert" title={t('Poznámka pro pokojskou')} aria-label={t('Poznámka pro pokojskou')}>!</span> : null}</span>
  </span>;
  return <span className="k-hk-requests">
    <span className="k-hk-requests__items" title={`${t('Pes')}: ${dogs ?? '?'}; ${t('Dětská postýlka')}: ${stay.cot_required == null ? '?' : stay.cot_required ? 1 : 0}`}>
      {Array.from({ length: Math.min(dogs ?? 0, 32) }, (_, index) => <RequestIcon key={index} kind="dog" confirmed={requirementConfirmed(stay, 'dog')} />)}
      {(dogs ?? 0) > 32 ? <b>+{dogs! - 32}</b> : null}
      {stay.cot_required ? <RequestIcon kind="cot" confirmed={requirementConfirmed(stay, 'cot')} /> : null}
      {dogs == null || stay.cot_required == null ? <span className="k-hk-request-unknown" title={t('Požadavky se nepodařilo určit')}>?</span> : null}
    </span>
    {stay.housekeeping_note?.trim() ? <span className="k-hk-room__note-alert" title={t('Poznámka pro pokojskou')} aria-label={t('Poznámka pro pokojskou')}>!</span> : null}
  </span>;
}

function CountryFlag({ stay }: { stay: HousekeepingStayRead }): JSX.Element {
  const label = countryName(stay.country_code, stay.country_name);
  const code = stay.country_code?.toUpperCase();
  const Flag = code && /^[A-Z]{2}$/.test(code) ? countryFlags[code as keyof typeof countryFlags] : undefined;
  return <span className="k-hk-reservation__country" title={label} aria-label={label}>
    {Flag ? <Flag className="k-hk-country-flag" aria-hidden="true" /> : '?'}
  </span>;
}

export function reservationTileName(stay: HousekeepingStayRead): string {
  return [...(stay.guests ?? []).map(guest => guest.name), stay.main_guest_name, stay.company_name, stay.display_name]
    .map(name => name?.trim()).find(Boolean) ?? '?';
}

export function ReservationStamp({ stay, kind, date }: { stay: HousekeepingStayRead; kind: StayKind; date: string }): JSX.Element {
  const label = kind === 'departure' ? t('CHECK-OUT') : kind === 'arrival' ? t('CHECK-IN') : t('POBYT');
  const time = kind === 'departure' ? stay.departure_time : stay.arrival_time;
  const names = (stay.guests ?? []).map((guest) => guest.name?.trim()).filter((name): name is string => Boolean(name));
  const nights = reservationNightProgress(stay, date);
  const name = reservationTileName(stay);
  return <span className={`k-hk-reservation k-hk-reservation--${stay.reservation_state ?? 'unknown'}`} data-reservation-id={stay.reservation_id} data-stay-kind={kind}>
    <span className="k-hk-reservation__identity"><b className="k-hk-reservation__name" title={names.length ? names.join(', ') : name}>{name}</b><CountryFlag stay={stay} /></span>
    <PersonCounts stay={stay} />
    <span className="k-hk-reservation__event" title={`${label}${kind === 'stay' ? '' : ` ${time ?? '?'}`} · ${t('Noc pobytu:')} ${nights}`}>
      <b className="k-hk-reservation__time">{kind === 'stay' ? '' : `${kind === 'departure' ? '←' : '→'}${time ?? '?'}`}</b><b className="k-hk-reservation__nights" style={numberWidth(nights)}>{nights}</b>
    </span>
    <ReservationRequests stay={stay} compact />
  </span>;
}

export function ReservationDetails({ stay, kind, date, onConfirm }: { stay: HousekeepingStayRead; kind: StayKind; date: string; onConfirm?: (stay: HousekeepingStayRead, kind: ReservationAmenityKind) => void }): JSX.Element {
  const timestamp = (value?: string | null) => value ? new Intl.DateTimeFormat(getIntlLocale(), { timeZone: 'Europe/Prague', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '?';
  return <section className={`k-hk-reservation-detail k-hk-reservation--${stay.reservation_state ?? 'unknown'}`} data-reservation-id={stay.reservation_id}>
    <h3>{t(kind === 'departure' ? 'Odjezd' : kind === 'arrival' ? 'Příjezd' : 'Pobyt')}{stay.reservation_code ? ` · ${stay.reservation_code}` : ''}</h3>
    <PersonCounts stay={stay} />
    <dl>
      <dt>{t('Rezervace')}</dt><dd>{stay.reservation_code ?? stay.reservation_id}</dd>
      <dt>{t('Stav rezervace')}</dt><dd>{stay.reservation_state ? t(RESERVATION_LABELS[stay.reservation_state]) : stay.reservation_status_name ?? '?'}</dd>
      <dt>{t('Příjezd')}</dt><dd>{stay.arrival} · {stay.arrival_time ?? '?'}</dd>
      <dt>{t('Odjezd')}</dt><dd>{stay.departure} · {stay.departure_time ?? '?'}</dd>
      <dt>{t('Skutečný CHECK-IN')}</dt><dd>{timestamp(stay.checked_in)}</dd>
      <dt>{t('Skutečný CHECK-OUT')}</dt><dd>{timestamp(stay.checked_out)}</dd>
      <dt>{t('Noc pobytu:')}</dt><dd>{reservationNightProgress(stay, date)}</dd>
      <dt>{t('Stát')}</dt><dd>{countryName(stay.country_code, stay.country_name)}</dd>
      <dt>{t('Firma')}</dt><dd>{stay.company_name ?? '?'}</dd>
      <dt>{t('Celkem osob')}</dt><dd>{stay.persons}{stay.unknown_persons ? ` · ${t('Neurčená věková skupina')}: ${stay.unknown_persons}` : ''}</dd>
      <dt>{t('Pes')}</dt><dd>{stay.dog_count ?? '?'}</dd>
      <dt>{t('Dětská postýlka')}</dt><dd>{stay.cot_required == null ? '?' : stay.cot_required ? '1' : '0'}</dd>
    </dl>
    <h4>{t('Ubytované osoby')}</h4>
    <ul>{(stay.guests ?? []).map((guest, index) => <li key={index}>{guest.name ?? '?'} · {countryName(guest.country_code)} · {guest.age ?? t(guest.age_group === 'adults' ? 'Dospělí' : guest.age_group === 'children' ? 'Děti 2–17 let' : guest.age_group === 'infants' ? 'Mimina do 2 let' : 'Neurčená věková skupina')}</li>)}</ul>
    {(stay.charges ?? []).length ? <ul className="k-hk-charge-details">{stay.charges!.map((charge, index) => <li key={index}>{charge.label} · {charge.quantity}{charge.date ? ` · ${charge.date}` : ''}</li>)}</ul> : null}
    <ReservationRequests stay={stay} />
    <div className="k-hk-confirm-actions">{(['dog', 'cot'] as const).filter((requirement) => requirement === 'dog' ? (stay.dog_count ?? 0) > 0 : stay.cot_required).map((requirement) => {
      const confirmed = requirementConfirmed(stay, requirement);
      return <button type="button" key={requirement} disabled={!onConfirm || confirmed} onClick={() => onConfirm?.(stay, requirement)}>{t(confirmed ? 'Potvrzeno' : 'Potvrdit')}: {t(requirement === 'dog' ? 'Pes' : 'Dětská postýlka')}{requirement === 'dog' ? ` ×${stay.dog_count}` : ''}</button>;
    })}</div>
    {stay.housekeeping_note?.trim() ? <p className="k-hk-housekeeping-note"><strong>{t('Poznámka pro pokojskou')}</strong><span>{stay.housekeeping_note}</span></p> : null}
  </section>;
}
