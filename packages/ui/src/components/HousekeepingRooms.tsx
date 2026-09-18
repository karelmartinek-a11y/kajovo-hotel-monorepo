import React from 'react';
import {
  apiClient,
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
  { value: 'clean', label: 'Uklizeno', detail: 'Pokoj je připravený pro nájezd.' },
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
  return new Intl.DateTimeFormat('cs-CZ', {
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
    <span className="k-hk-stay__name">{stay.guest_label ?? 'Host neuveden'}</span>
    <span className="k-hk-stay__country">{stay.country_name ?? 'Stát neuveden'}</span>
    <span className="k-hk-stay__nights">Noc pobytu: <strong>{elapsed}/{nights}</strong></span>
    <span className="k-hk-room__persons"><GuestIcon /> {stay.persons}</span>
    <span className="k-hk-amenities">{(stay.amenities ?? []).filter((item) => item.active).map((item) =>
      <span key={item.kind} className={`k-hk-amenity k-hk-amenity--${item.state}`} title={`${AMENITY_LABELS[item.kind]}: ${item.state === 'red' ? 'čeká' : 'hotovo'}`}>
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
  const label = OPERATIONAL_LABELS[room.operational_state];
  const left = room.departures.length ? room.departures.some((stay) => !stay.checked_out) ? 'red' : 'neutral' : 'empty';
  const right = room.arrivals.length ? room.ready_for_arrival ? 'green' : 'red' : 'empty';
  const split = room.departures.length > 0 || room.arrivals.length > 0;
  return (
    <button
      className={`k-hk-room${split ? ` k-hk-room--split k-hk-room--left-${left} k-hk-room--right-${right}` : ''}`}
      type="button"
      onClick={() => onSelect(room)}
      aria-label={`Pokoj ${room.room_number}, ${label}. Změnit stav pokoje.`}
    >
      <span className="k-hk-room__topline">
        <strong>{room.room_number}</strong>
        <span className="k-hk-room__chevron" aria-hidden="true">›</span>
      </span>
      <span className="k-hk-room__state"><i aria-hidden="true" />{label}</span>
      {room.departures.length || room.arrivals.length ? <span className="k-hk-room__stays">
        <span>{room.departures.map((stay) => <StayDetails key={stay.reservation_id} stay={stay} date={date} label="Odjezd" />)}</span>
        <span>{room.arrivals.map((stay) => <StayDetails key={stay.reservation_id} stay={stay} date={date} label="Příjezd" />)}</span>
      </span> : null}
      {room.stays.map((stay) => <StayDetails key={stay.reservation_id} stay={stay} date={date} label="Pobyt" />)}
      {!room.departures.length && !room.arrivals.length && !room.stays.length ? <span className="k-hk-stay">Bez pobytu ve vybraný den</span> : null}
      {room.housekeeping_status ? <span className="k-hk-room__housekeeping">{room.housekeeping_status}</span> : null}
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
  const selectedRoom = overview?.rooms.find((room) => room.room_id === selectedRoomId) ?? null;
  const selectRoom = React.useCallback((room: HousekeepingRoomRead) => setSelectedRoomId(room.room_id), []);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [savingStatus, setSavingStatus] = React.useState<HousekeepingRoomStatus | null>(null);
  const [savingAmenity, setSavingAmenity] = React.useState(false);
  const requestSequence = React.useRef(0);
  const savingRef = React.useRef(false);

  const loadRooms = React.useCallback(async (dateValue: string, background = false): Promise<void> => {
    const sequence = ++requestSequence.current;
    if (!background) { setLoading(true); setError(null); }
    try {
      const response = await apiClient.getHousekeepingRoomsApiV1HousekeepingRoomsGet({ date: dateValue });
      if (sequence === requestSequence.current) setOverview(response);
    } catch {
      if (sequence === requestSequence.current) setError('Přehled se nepodařilo obnovit. Zobrazené údaje mohou být zastaralé.');
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

  React.useEffect(() => {
    if (!selectedRoomId) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('.k-hk-modal__dialog');
    dialog?.querySelector<HTMLButtonElement>('button')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) setSelectedRoomId(null);
      if (event.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled)'));
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [selectedRoomId]);

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
    if (!selectedRoom || !canWrite) return;
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
      await loadRooms(selectedDate, true);
    } catch {
      setError('Změnu stavu se nepodařilo bezpečně uložit a ověřit v Better Hotel.');
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
      setError('Ikonu se nepodařilo uložit. Pobyt nebo ikonu mohl mezitím změnit jiný uživatel; načítám aktuální údaje.');
    } finally {
      await loadRooms(selectedDate, true);
      setSavingAmenity(false);
      savingRef.current = false;
    }
  };
  const busy = savingStatus !== null || savingAmenity;

  return (
    <section className="k-hk-board" data-testid="housekeeping-rooms-view">
      <header className="k-hk-board__header">
        <div>
          <h2>Pokoje</h2>
          <p>Přehled pokojů a úklidu na vybraný den</p>
        </div>
        <p className="k-hk-board__motto">Čistý pokoj,<br />spokojený host ♡</p>
      </header>
      <div className="k-hk-datebar">
        <button type="button" disabled={busy} onClick={() => setSelectedDate((value) => shiftDate(value, -1))} aria-label="Předchozí den">‹</button>
        <label>
          <span aria-hidden="true">▣</span>
          <input type="date" disabled={busy} value={selectedDate} onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value); }} aria-label="Vybraný den" />
          <strong>{formatDate(selectedDate)}</strong>
        </label>
        <button type="button" disabled={busy} onClick={() => setSelectedDate((value) => shiftDate(value, 1))} aria-label="Následující den">›</button>
        <button className="k-hk-datebar__today" type="button" disabled={busy} onClick={() => setSelectedDate(todayInPrague())}>Dnes</button>
      </div>
      <p className="k-hk-board__source-note">Pobyty a barevné poloviny podle vybraného dne. Obsazenost a úklid jsou aktuální právě teď. Zelený příjezd znamená uklizeno pro nájezd.</p>
      <div className="k-hk-legend" aria-label="Legenda stavů">
        {([
          ['red', 'Odjezd bez check-out / příjezd nepřipraven'],
          ['green', 'Příjezd – uklizeno pro nájezd'],
          ['neutral', 'Odjel / pokračující pobyt'],
          ['empty', 'Bez příjezdu či odjezdu'],
        ] as const).map(([key, label]) => (
          <span key={key} className={`k-hk-legend__item k-hk-legend__item--${key}`}>
            <i aria-hidden="true" />{label}
          </span>
        ))}
      </div>
      {error && !selectedRoom ? <div className="k-hk-alert" role="alert">{error}<button type="button" onClick={() => void loadRooms(selectedDate)}>Zkusit znovu</button></div> : null}
      {loading ? <div className="k-hk-loading" aria-live="polite">Načítám aktuální přehled pokojů…</div> : null}
      {!loading && overview?.rooms.length === 0 ? <div className="k-hk-loading">Better Hotel nevrátil žádné provozní pokoje.</div> : null}
      {!loading ? FLOOR_ORDER.map((floor) => {
        const rooms = roomsByFloor.get(floor) ?? [];
        if (rooms.length === 0) return null;
        const cleaningCount = rooms.filter((room) => room.operational_state.startsWith('checkout') && room.operational_state !== 'checkout_departed_clean').length;
        return (
          <section className="k-hk-floor" key={floor}>
            <header className="k-hk-floor__header">
              <span className="k-hk-floor__title"><LayersIcon /><strong>{FLOOR_LABELS[floor] ?? `${floor}. patro`}</strong></span>
              <span>{rooms.length} {rooms.length === 1 ? 'pokoj' : 'pokojů'} <i /> {cleaningCount} k úklidu</span>
            </header>
            <div className="k-hk-floor__rooms">
              {rooms.map((room) => <RoomCard key={room.room_id} room={room} date={selectedDate} onSelect={selectRoom} />)}
            </div>
          </section>
        );
      }) : null}
      <footer className="k-hk-board__thanks"><span aria-hidden="true">❧</span><strong>Děkujeme, že pomáháte vytvářet domov na cestách.</strong><small>Váš úklid dělá velký rozdíl.</small></footer>

      {selectedRoom ? (
        <div className="k-hk-modal" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setSelectedRoomId(null); }}>
          <div className="k-hk-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="k-hk-room-dialog-title">
            <header>
              <div><span>Pokoj</span><h3 id="k-hk-room-dialog-title">{selectedRoom.room_number}</h3></div>
              <button type="button" disabled={busy} onClick={() => setSelectedRoomId(null)} aria-label="Zavřít dialog">×</button>
            </header>
            <p className="k-hk-modal__current">Aktuální stav úklidu: <strong>{selectedRoom.housekeeping_status ?? 'Neurčen'}</strong></p>
            {error ? <p role="alert" className="k-hk-alert">{error}</p> : null}
            <div className="k-hk-status-actions">
              {STATUS_ACTIONS.map((action) => (
                <button key={action.value} type="button" onClick={() => void updateStatus(action.value)} disabled={!canWrite || busy}>
                  <strong>{action.label}</strong><span>{action.detail}</span>
                  {savingStatus === action.value ? <em>Ukládám…</em> : null}
                </button>
              ))}
            </div>
            <div className="k-hk-reservation-actions">
              {(['departures', 'arrivals', 'stays'] as const).map((group) => selectedRoom[group].map((stay) => <section key={`${group}-${stay.reservation_id}`} aria-label={`${group === 'departures' ? 'Odjezd' : group === 'arrivals' ? 'Příjezd' : 'Pobyt'}: ${stay.guest_label ?? 'Host'}`}>
                <StayDetails stay={stay} date={selectedDate} label={group === 'departures' ? 'Odjezd' : group === 'arrivals' ? 'Příjezd' : 'Pobyt'} />
                <div className="k-hk-amenity-actions">{(['dog', 'cot'] as const).map((kind) => {
                  const item = stay.amenities?.find((entry) => entry.kind === kind);
                  return <div key={kind}>
                    {item?.active ? <><button type="button" disabled={busy || !canWrite} className={`k-hk-amenity k-hk-amenity--${item.state}`} onClick={() => void changeAmenity(stay, kind, 'color')}><AmenityIcon kind={kind} />{AMENITY_LABELS[kind]}: {item.state === 'red' ? 'Čeká → hotovo' : 'Hotovo → čeká'}</button>
                      {canManageAmenities ? <button type="button" disabled={busy} onClick={() => void changeAmenity(stay, kind, 'remove')}>Odebrat: {AMENITY_LABELS[kind]}</button> : null}</>
                      : canManageAmenities ? <button type="button" disabled={busy} onClick={() => void changeAmenity(stay, kind, 'add')}><AmenityIcon kind={kind} />Přidat: {AMENITY_LABELS[kind]}</button> : <span>{AMENITY_LABELS[kind]}: nepožadováno</span>}
                  </div>;
                })}</div>
              </section>))}
              {!selectedRoom.departures.length && !selectedRoom.arrivals.length && !selectedRoom.stays.length ? <p>Ve vybraný den není přiřazen pobyt. Ikony nelze přidat.</p> : null}
            </div>
            {!canWrite ? <p className="k-hk-modal__readonly">Aktivní role může přehled pouze číst.</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
