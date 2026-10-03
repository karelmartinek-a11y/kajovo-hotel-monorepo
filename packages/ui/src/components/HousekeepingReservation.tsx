import React from 'react';
import { getIntlLocale, t, type HousekeepingStayRead, type ReservationAmenityKind } from '@kajovo/shared';

export type StayKind = 'departure' | 'arrival' | 'stay';
export const RESERVATION_LABELS = { confirmed: 'Potvrzeno', checked_in: 'CHECK-IN', checked_out: 'CHECK-OUT', option: 'Opce' };

export function countryName(code?: string | null, fallback?: string | null): string {
  if (!code) return fallback || '?';
  try { return new Intl.DisplayNames([getIntlLocale()], { type: 'region' }).of(code) ?? '?'; }
  catch { return '?'; }
}

function PersonIcon({ kind }: { kind: 'adults' | 'children' | 'infants' }): JSX.Element {
  return <svg className={`k-hk-person-icon k-hk-person-icon--${kind}`} viewBox="0 0 16 24" aria-hidden="true">
    {kind === 'adults' ? <><circle cx="8" cy="3.5" r="3" /><path d="M5 8h6c2 0 3 1 3 3v6h-2v-6h-1v12H8.8v-8H7.2v8H5V11H4v6H2v-6c0-2 1-3 3-3Z" /></>
      : kind === 'children' ? <><circle cx="8" cy="7" r="3.5" /><path d="M5 12h6l4 5-2 1-2-3v7H8.8v-5H7.2v5H5v-7l-2 3-2-1Z" /></>
      : <><path d="M8 2c-2-2-5 0-3 2h3V2Z" /><circle cx="8" cy="7" r="5" /><path d="M3 12h10c2 3 1 8-5 11-6-3-7-8-5-11Z" /><path d="m4 14 8 5m0-5-8 5" fill="none" stroke="var(--k-hk-person-cutout)" strokeWidth="1.6" /></>}
  </svg>;
}

export function PersonCounts({ stay }: { stay: HousekeepingStayRead }): JSX.Element {
  return <span className="k-hk-person-counts">
    {(['adults', 'children', 'infants'] as const).map((kind) => <span key={kind} data-age-group={kind} title={`${t(kind === 'adults' ? 'Dospělí' : kind === 'children' ? 'Děti 2–17 let' : 'Mimina do 2 let')}: ${stay[kind] ?? '?'}`}>
      <PersonIcon kind={kind} /><b>{stay[kind] ?? '?'}</b>
    </span>)}
  </span>;
}

export function requirementConfirmed(stay: HousekeepingStayRead, kind: ReservationAmenityKind): boolean {
  return (stay.amenities ?? []).some((item) => item.kind === kind && item.active && item.state === 'green');
}

function RequestIcon({ kind, confirmed }: { kind: ReservationAmenityKind; confirmed: boolean }): JSX.Element {
  const color = confirmed ? '#22a55c' : '#e84848';
  return <svg className="k-hk-request-icon" data-request-kind={kind} data-request-state={confirmed ? 'green' : 'red'} viewBox="0 0 24 24" aria-hidden="true">
    {kind === 'dog' ? <><g stroke="#111" strokeWidth="1.2" strokeLinejoin="round"><path fill={color} d="M5 10h11v9h-3v-4H8v4H5Z" /><path fill={confirmed ? '#82dba4' : '#ff9292'} d="M14 4h6l2 4-2 5h-6Z" /><path fill={color} d="m14 4-2 5 4 2 1-7Z" /></g><path stroke="#111" strokeWidth="3" fill="none" d="M5 12 2 8" /><circle cx="19" cy="7" r="1" fill="#111" /><path fill="#111" d="m21 8 2 1-2 1Z" /></>
      : <><path fill={color} stroke="#111" d="M3 8h18v9H3Z" /><path stroke="#111" strokeWidth="2" fill="none" d="M3 4v17m18-17v17M3 7h18M3 18h18M7 7v11m5-11v11m5-11v11" /></>}
  </svg>;
}

export function ReservationRequests({ stay }: { stay: HousekeepingStayRead }): JSX.Element {
  const dogs = stay.dog_count ?? 0;
  return <span className="k-hk-requests">
    <span className="k-hk-requests__items" title={`${t('Pes')}: ${stay.dog_count ?? '?'}; ${t('Dětská postýlka')}: ${stay.cot_required == null ? '?' : stay.cot_required ? '1' : '0'}`}>
      {Array.from({ length: Math.min(dogs, 32) }, (_, index) => <RequestIcon key={index} kind="dog" confirmed={requirementConfirmed(stay, 'dog')} />)}
      {dogs > 32 ? <b>+{dogs - 32}</b> : null}
      {stay.cot_required ? <RequestIcon kind="cot" confirmed={requirementConfirmed(stay, 'cot')} /> : null}
      {stay.dog_count == null || stay.cot_required == null ? <span className="k-hk-request-unknown" title={t('Požadavky se nepodařilo určit')}>?</span> : null}
    </span>
    {stay.housekeeping_note?.trim() ? <span className="k-hk-room__note-alert" title={t('Poznámka pro pokojskou')} aria-label={t('Poznámka pro pokojskou')}>!</span> : null}
  </span>;
}

function StayEvent({ kind }: { kind: StayKind }): JSX.Element {
  return <svg className="k-hk-event-icon" viewBox="0 0 24 24" aria-hidden="true">
    {kind === 'stay' ? <path d="M3 5v15m18-7v7M3 16h18M6 10h5v6m0-3h10M6 8h3" /> : <>
      <path d="M13 3h7v18h-7" />
      <path d={kind === 'arrival' ? 'M2 12h14m-5-5 5 5-5 5' : 'M16 12H2m5-5-5 5 5 5'} />
    </>}
  </svg>;
}

export function ReservationStamp({ stay, kind }: { stay: HousekeepingStayRead; kind: StayKind }): JSX.Element {
  const label = kind === 'departure' ? t('CHECK-OUT') : kind === 'arrival' ? t('CHECK-IN') : t('POBYT');
  const time = kind === 'departure' ? stay.departure_time : stay.arrival_time;
  return <span className={`k-hk-reservation k-hk-reservation--${stay.reservation_state ?? 'unknown'}`} data-reservation-id={stay.reservation_id} data-stay-kind={kind}>
    <PersonCounts stay={stay} />
    <span className="k-hk-reservation__event" title={`${label}${kind === 'stay' ? '' : ` ${time ?? '?'}`}`}><StayEvent kind={kind} /><b className="k-hk-reservation__event-label">{label}</b>{kind !== 'stay' ? <b className="k-hk-reservation__time">{time ?? '?'}</b> : null}</span>
    <span className="k-hk-reservation__country" title={countryName(stay.country_code, stay.country_name)}>{stay.country_code_alpha3 ?? '?'}</span>
    <ReservationRequests stay={stay} />
  </span>;
}

export function ReservationDetails({ stay, kind, date, onConfirm }: { stay: HousekeepingStayRead; kind: StayKind; date: string; onConfirm?: (stay: HousekeepingStayRead, kind: ReservationAmenityKind) => void }): JSX.Element {
  const day = (value: string) => Date.parse(`${value}T00:00:00Z`) / 86_400_000;
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
      <dt>{t('Noc pobytu:')}</dt><dd>{day(date) - day(stay.arrival)}/{day(stay.departure) - day(stay.arrival)}</dd>
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
