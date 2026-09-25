import React from 'react';
import { TaskDialog } from './TaskDialog';
import {
  apiClient,
  t,
  getIntlLocale,
  type HousekeepingOperationalState,
  type HousekeepingRoomRead,
  type HousekeepingRoomStatus,
  type HousekeepingRoomsOverview,
  type HousekeepingStayRead,
  type ReservationAmenityKind,
} from '@kajovo/shared';

const PRAGUE_TIME_ZONE = 'Europe/Prague';
const FLOOR_ORDER = ['3', '2', '1', '0'];

const OPERATIONAL_LABELS: Record<HousekeepingOperationalState, string> = {
  checkout_departed_dirty: 'VOLNO',
  checkout_departed_clean: 'VOLNO',
  checkout_pending: 'OBSAZENO-ODJÍŽDÍ',
  checkout_pending_clean: 'OBSAZENO-ODJÍŽDÍ',
  arrived: 'OBSAZENO-PŘIJEL',
  occupied: 'OBSAZENO-POBYT',
  free: 'VOLNO',
};

const FLOOR_LABELS: Record<string, string> = {
  '3': '3. patro',
  '2': '2. patro',
  '1': '1. patro',
  '0': 'Přízemí',
};

const STATUS_ACTIONS: Array<{ value: HousekeepingRoomStatus; label: string; detail: string }> = [
  { value: 'clean', label: 'Uklizeno', detail: 'Pokoj je uklizený.' },
  { value: 'dirty', label: 'Neuklizeno', detail: 'Pokoj čeká na úklid.' },
  { value: 'stay_no_linen', label: 'Průběžný úklid', detail: 'Bez výměny ložního prádla.' },
  { value: 'stay_with_linen', label: 'Průběžný úklid + prádlo', detail: 'S výměnou ložního prádla.' },
  { value: 'do_not_disturb', label: 'Nerušenka', detail: 'Host si nepřeje být rušen.' },
  { value: 'technical_issue', label: 'Technická závada', detail: 'Pokoj vyžaduje technický zásah.' },
];

function localDateParts(value: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRAGUE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  return { year: get('year'), month: get('month'), day: get('day') };
}

function todayInPrague(): string {
  const parts = localDateParts(new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  return shifted.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(getIntlLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

function LayersIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 9 5-9 5-9-5 9-5Zm-7.8 9.2L12 16.5l7.8-4.3M4.2 16.2 12 20.5l7.8-4.3" />
    </svg>
  );
}

function AmenityIcon({ kind }: { kind: ReservationAmenityKind }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {kind === 'dog' ? <path d="m15 8 2-4 4 3-1 5h-4v7m-9 0v-7h9M7 12 3 8v6l4 2m4-4v7m7-11h.1" /> : <path d="M3 5v16m18-16v16M3 8h18M3 17h18M7 8v9m5-9v9m5-9v9M3 5h3m12 0h3" />}
    </svg>
  );
}

const AMENITY_LABELS: Record<ReservationAmenityKind, string> = { dog: 'Pes', cot: 'Dětská postýlka' };

function StayDetails({ stay, label, date }: { stay: HousekeepingStayRead; label: string; date: string }): JSX.Element {
  const calendarDay = (value: string) => Date.parse(`${value}T00:00:00Z`) / 86_400_000;
  const nights = calendarDay(stay.departure) - calendarDay(stay.arrival);
  const elapsed = calendarDay(date) - calendarDay(stay.arrival);
  return <span className="k-hk-stay" data-reservation-id={stay.reservation_id}>
    <span className="k-hk-stay__label">{label}</span>
    <span className="k-hk-stay__name">{stay.guest_label ?? t('Host neuveden')}</span>
    <span className="k-hk-stay__country">{stay.country_code ? new Intl.DisplayNames([getIntlLocale()], { type: 'region' }).of(stay.country_code) : stay.country_name ?? t('Stát neuveden')}</span>
    <span className="k-hk-stay__nights">{t("Noc pobytu:")}{' '}<strong>{elapsed}/{nights}</strong></span>
    <span className="k-hk-room__persons"><GuestIcon /> {stay.persons}</span>
    <span className="k-hk-amenities">{(stay.amenities ?? []).filter((item) => item.active).map((item) =>
      <span key={item.kind} className={`k-hk-amenity k-hk-amenity--${item.state}`} title={`${t(AMENITY_LABELS[item.kind])}: ${item.state === 'red' ? t('čeká') : t('hotovo')}`}>
        <AmenityIcon kind={item.kind} /><span className="k-hk-amenity__mark">{item.state === 'red' ? '!' : '✓'}</span>
      </span>)}
    </span>
  </span>;
}

function GuestIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3" />
      <path d="M6.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6" />
    </svg>
  );
}

type RoomCardProps = {
  room: HousekeepingRoomRead;
  date: string;
  onSelect: (room: HousekeepingRoomRead) => void;
};

const RoomCard = React.memo(function RoomCard({ room, date, onSelect }: RoomCardProps): JSX.Element {
  const label = t(OPERATIONAL_LABELS[room.operational_state]);
  const left = room.departures.length ? room.departures.some((stay) => !stay.checked_out) ? 'red' : 'neutral' : 'empty';
  const right = room.housekeeping_status_key === 'clean' || room.ready_for_arrival ? 'green'
    : room.housekeeping_status_key === 'stay_no_linen' || room.housekeeping_status_key === 'stay_with_linen' ? 'light-green'
      : room.arrivals.length ? 'red' : 'empty';
  const split = room.departures.length > 0 || room.arrivals.length > 0 || right !== 'empty';
  return (
    <button
      className={`k-hk-room${split ? ` k-hk-room--split k-hk-room--left-${left} k-hk-room--right-${right}` : ''}`}
      type="button"
      onClick={() => onSelect(room)}
      data-room-id={room.room_id}
      aria-label={`${t('Pokoj')} ${room.room_number}, ${label}. ${t('Změnit stav pokoje.')}`}
    >
      <span className="k-hk-room__topline">
        <strong>{room.room_number}</strong>
        <span className="k-hk-room__chevron" aria-hidden="true">›</span>
      </span>
      <span className="k-hk-room__state"><i aria-hidden="true" />{label}</span>
      {room.departures.length || room.arrivals.length ? <span className="k-hk-room__stays">
        <span>{room.departures.map((stay) => <StayDetails key={stay.reservation_id} stay={stay} date={date} label={t("Odjezd")} />)}</span>
        <span>{room.arrivals.map((stay) => <StayDetails key={stay.reservation_id} stay={stay} date={date} label={t("Příjezd")} />)}</span>
      </span> : null}
      {room.stays.map((stay) => <StayDetails key={stay.reservation_id} stay={stay} date={date} label={t("Pobyt")} />)}
      {!room.departures.length && !room.arrivals.length && !room.stays.length ? <span className="k-hk-stay">{t("Bez pobytu ve vybraný den")}</span> : null}
      {room.housekeeping_status ? <span className="k-hk-room__housekeeping">{t(room.housekeeping_status)}</span> : null}
    </button>
  );
});

export type HousekeepingRoomsProps = {
  canWrite?: boolean;
  canManageAmenities?: boolean;
};

export function HousekeepingRooms({ canWrite = true, canManageAmenities = false }: HousekeepingRoomsProps): JSX.Element {
  const [selectedDate, setSelectedDate] = React.useState(todayInPrague);
  const [overview, setOverview] = React.useState<HousekeepingRoomsOverview | null>(null);
  const [selectedRoomId, setSelectedRoomId] = React.useState<string | null>(null);
  const [panel, setPanel] = React.useState<'status' | 'amenities'>('status');
  const [announcement, setAnnouncement] = React.useState('');
  const selectedRoom = overview?.rooms.find((room) => room.room_id === selectedRoomId) ?? null;
  const selectRoom = React.useCallback((room: HousekeepingRoomRead) => { setPanel('status'); setSelectedRoomId(room.room_id); }, []);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [savingStatus, setSavingStatus] = React.useState<HousekeepingRoomStatus | null>(null);
  const [savingAmenity, setSavingAmenity] = React.useState(false);
  const requestSequence = React.useRef(0);
  const savingRef = React.useRef(false);
  const overviewScroll = React.useRef({ page: 0, board: 0 });
  const boardRef = React.useRef<HTMLElement>(null);
  const stayHeading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    if (panel === 'amenities') { window.scrollTo({ top: 0 }); boardRef.current?.scrollTo({ top: 0 }); stayHeading.current?.focus({ preventScroll: true }); }
  }, [panel]);

  const loadRooms = React.useCallback(async (dateValue: string, background = false): Promise<void> => {
    const sequence = ++requestSequence.current;
    if (!background) { setLoading(true); setError(null); }
    try {
      const response = await apiClient.getHousekeepingRoomsApiV1HousekeepingRoomsGet({ date: dateValue });
      if (sequence === requestSequence.current) { setOverview(response); setError(null); }
    } catch {
      if (sequence === requestSequence.current) setError(t('Přehled se nepodařilo obnovit. Zobrazené údaje mohou být zastaralé.'));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setSelectedRoomId(null);
    setOverview(null);
    void loadRooms(selectedDate);
    const refresh = () => { if (!document.hidden && !savingRef.current) void loadRooms(selectedDate, true); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { ++requestSequence.current; window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [loadRooms, selectedDate]);

  const roomsByFloor = React.useMemo(() => {
    const grouped = new Map<string, HousekeepingRoomRead[]>();
    for (const room of overview?.rooms ?? []) {
      const rooms = grouped.get(room.floor) ?? [];
      rooms.push(room);
      grouped.set(room.floor, rooms);
    }
    return grouped;
  }, [overview?.rooms]);

  const updateStatus = async (status: HousekeepingRoomStatus): Promise<void> => {
    if (!selectedRoom || !canWrite || savingRef.current) return;
    savingRef.current = true;
    ++requestSequence.current;
    setSavingStatus(status);
    setError(null);
    try {
      const updated = await apiClient.updateHousekeepingRoomStatusApiV1HousekeepingRoomsRoomIdPatch(
        selectedRoom.room_id,
        { date: selectedDate },
        { status },
      );
      setOverview((current) => current ? {
        ...current,
        rooms: current.rooms.map((room) => room.room_id === updated.room_id ? updated : room),
      } : current);
      setAnnouncement(`${t('Pokoj')} ${updated.room_number}: ${t(updated.housekeeping_status ?? '')}. ${t('Změna byla uložena.')}`);
      setSelectedRoomId(null);
      void loadRooms(selectedDate, true);
    } catch {
      setError(t('Změnu se nepodařilo ověřit. Před dalším pokusem obnovte aktuální stav pokoje.'));
    } finally {
      setSavingStatus(null);
      savingRef.current = false;
    }
  };

  const changeAmenity = async (stay: HousekeepingStayRead, kind: ReservationAmenityKind, operation: 'add' | 'color' | 'remove'): Promise<void> => {
    if (!selectedRoom || !canWrite || savingRef.current) return;
    const existing = stay.amenities?.find((item) => item.kind === kind);
    savingRef.current = true;
    ++requestSequence.current;
    setSavingAmenity(true);
    setError(null);
    const query = { date: selectedDate, room_id: selectedRoom.room_id };
    try {
      if (operation === 'add') await apiClient.addReservationAmenityApiV1HousekeepingReservationsReservationIdAmenitiesKindPost(stay.reservation_id, kind, { ...query, version: existing?.version ?? 0 });
      else if (operation === 'remove') await apiClient.removeReservationAmenityApiV1HousekeepingReservationsReservationIdAmenitiesKindDelete(stay.reservation_id, kind, { ...query, version: existing!.version });
      else await apiClient.updateReservationAmenityApiV1HousekeepingReservationsReservationIdAmenitiesKindPatch(stay.reservation_id, kind, query, { version: existing!.version, state: existing!.state === 'red' ? 'green' : 'red' });
    } catch {
      setError(t('Ikonu se nepodařilo uložit. Pobyt nebo ikonu mohl mezitím změnit jiný uživatel; načítám aktuální údaje.'));
    } finally {
      await loadRooms(selectedDate, true);
      setSavingAmenity(false);
      savingRef.current = false;
    }
  };
  const busy = savingStatus !== null || savingAmenity;

  if (selectedRoom && panel === 'amenities') return <section ref={boardRef} className="k-hk-board k-hk-stay-screen" data-testid="housekeeping-stay-screen">
    <button className="k-hk-open-stays" disabled={busy} onClick={() => { setPanel('status'); setError(null); window.requestAnimationFrame(() => { window.scrollTo({ top: overviewScroll.current.page }); boardRef.current?.scrollTo({ top: overviewScroll.current.board }); }); }}>{t("← Zpět na stav pokoje")}</button>
    <h2 ref={stayHeading} tabIndex={-1}>{t("Pokoj")}{' '}{selectedRoom.room_number}{' '}{t("· Pobyty a ikony")}</h2>
    {error ? <p className="k-hk-alert" role="alert">{error}</p> : null}
    {savingAmenity ? <p role="status">{t("Ukládám ikonu…")}</p> : null}
            <div className="k-hk-reservation-actions">
              {(['departures', 'arrivals', 'stays'] as const).map((group) => selectedRoom[group].map((stay) => <section key={`${group}-${stay.reservation_id}`} aria-label={`${group === 'departures' ? t('Odjezd') : group === 'arrivals' ? t('Příjezd') : t('Pobyt')}: ${stay.guest_label ?? t('Host')}`}>
                <StayDetails stay={stay} date={selectedDate} label={group === 'departures' ? t('Odjezd') : group === 'arrivals' ? t('Příjezd') : t('Pobyt')} />
                <div className="k-hk-amenity-actions">{(['dog', 'cot'] as const).map((kind) => {
                  const item = stay.amenities?.find((entry) => entry.kind === kind);
                  return <div key={kind}>
                    {item?.active ? <><button type="button" disabled={busy || !canWrite} className={`k-hk-amenity k-hk-amenity--${item.state}`} onClick={() => void changeAmenity(stay, kind, 'color')}><AmenityIcon kind={kind} />{t(AMENITY_LABELS[kind])}: {item.state === 'red' ? t('Čeká → hotovo') : t('Hotovo → čeká')}</button>
                      {canManageAmenities ? <button type="button" disabled={busy} onClick={() => void changeAmenity(stay, kind, 'remove')}>{t("Odebrat:")}{' '}{t(AMENITY_LABELS[kind])}</button> : null}</>
                      : canManageAmenities ? <button type="button" disabled={busy} onClick={() => void changeAmenity(stay, kind, 'add')}><AmenityIcon kind={kind} />{t("Přidat:")}{' '}{t(AMENITY_LABELS[kind])}</button> : <span>{t(AMENITY_LABELS[kind])}{t(": nepožadováno")}</span>}
                  </div>;
                })}</div>
              </section>))}
              {!selectedRoom.departures.length && !selectedRoom.arrivals.length && !selectedRoom.stays.length ? <p>{t("Ve vybraný den není přiřazen pobyt. Ikony nelze přidat.")}</p> : null}
            </div>
  </section>;

  return (
    <section ref={boardRef} className="k-hk-board" data-testid="housekeeping-rooms-view">
      <header className="k-hk-board__header">
        <div>
          <h2>{t("Pokoje")}</h2>
        </div>
      </header>
      <div className="k-hk-datebar">
        <button type="button" disabled={busy} onClick={() => setSelectedDate((value) => shiftDate(value, -1))} aria-label={t("Předchozí den")}>‹</button>
        <label>
          <span aria-hidden="true">▣</span>
          <input type="date" disabled={busy} value={selectedDate} onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value); }} aria-label={t("Vybraný den")} />
          <strong>{formatDate(selectedDate)}</strong>
        </label>
        <button type="button" disabled={busy} onClick={() => setSelectedDate((value) => shiftDate(value, 1))} aria-label={t("Následující den")}>›</button>
        <button className="k-hk-datebar__today" type="button" disabled={busy} onClick={() => setSelectedDate(todayInPrague())}>{t("Dnes")}</button>
      </div>
      {announcement ? <p className="k-hk-saved" role="status">{announcement}</p> : null}
      <p className="k-hk-board__source-note">{t("Pobyty podle data · Obsazenost a úklid nyní.")}</p>
      <details className="k-hk-help"><summary>{t("Vysvětlivky barev")}</summary>
      <div className="k-hk-legend" aria-label={t("Legenda stavů")}>
        {([
          ['red', t('Odjezd bez check-out / příjezd nepřipraven')],
          ['green', t('Uklizený pokoj')],
          ['light-green', t('Průběžně uklizený pokoj')],
          ['neutral', t('Odjel / pokračující pobyt')],
          ['empty', t('Bez příjezdu či odjezdu')],
        ] as const).map(([key, label]) => (
          <span key={key} className={`k-hk-legend__item k-hk-legend__item--${key}`}>
            <i aria-hidden="true" />{label}
          </span>
        ))}
      </div>
      </details>
      {error && !selectedRoom ? <div className="k-hk-alert" role="alert">{error}<button type="button" onClick={() => void loadRooms(selectedDate)}>{t("Zkusit znovu")}</button></div> : null}
      {loading ? <div className="k-hk-loading" aria-live="polite">{t("Načítám aktuální přehled pokojů…")}</div> : null}
      {!loading && overview?.rooms.length === 0 ? <div className="k-hk-loading">{t("Better Hotel nevrátil žádné provozní pokoje.")}</div> : null}
      {!loading ? FLOOR_ORDER.map((floor) => {
        const rooms = roomsByFloor.get(floor) ?? [];
        if (rooms.length === 0) return null;
        const cleaningCount = rooms.filter((room) => room.operational_state.startsWith('checkout') && room.operational_state !== 'checkout_departed_clean').length;
        return (
          <section className="k-hk-floor" key={floor}>
            <header className="k-hk-floor__header">
              <span className="k-hk-floor__title"><LayersIcon /><strong>{t(FLOOR_LABELS[floor] ?? `${floor}. patro`)}</strong></span>
              <span>{rooms.length} {rooms.length === 1 ? t('pokoj') : t('pokojů')} <i /> {cleaningCount}{' '}{t("k úklidu")}</span>
            </header>
            <div className="k-hk-floor__rooms">
              {rooms.map((room) => <RoomCard key={room.room_id} room={room} date={selectedDate} onSelect={selectRoom} />)}
            </div>
          </section>
        );
      }) : null}

      {selectedRoom ? <TaskDialog title={savingStatus ? t('Zapisuji změnu…') : `${t('Pokoj')} ${selectedRoom.room_number}`} busy={busy} onClose={() => setSelectedRoomId(null)} className="k-hk-task">
        {savingStatus ? <div className="k-hk-saving" role="status"><span className="k-modal-spinner" aria-hidden="true" /><p>{t("Ukládám stav pokoje")}{' '}{selectedRoom.room_number}{t(". Po zápisu se vrátíte na přehled.")}</p></div> : <>
          <p className="k-hk-modal__current">{t("Aktuální stav úklidu:")}{' '}<strong>{selectedRoom.housekeeping_status ? t(selectedRoom.housekeeping_status) : t('Neurčen')}</strong></p>
          {error ? <div className="k-hk-alert" role="alert"><p>{error}</p><button disabled={loading} onClick={() => void loadRooms(selectedDate, true)}>{t("Obnovit stav")}</button></div> : null}
          {!error ? <><div className="k-hk-status-actions">{STATUS_ACTIONS.map((action) => <button key={action.value} type="button" title={t(action.detail)} aria-label={`${t(action.label)} ${t(action.detail)}`} onClick={() => void updateStatus(action.value)} disabled={!canWrite || busy}><strong>{t(action.label)}</strong></button>)}</div>
          <button className="k-hk-open-stays" onClick={() => { overviewScroll.current = { page: window.scrollY, board: boardRef.current?.scrollTop ?? 0 }; setPanel('amenities'); setError(null); }}>{t("Pobyty a ikony")}</button></> : null}
          {!canWrite ? <p>{t("Aktivní role může přehled pouze číst.")}</p> : null}
        </>}
      </TaskDialog> : null}
    </section>
  );
}
