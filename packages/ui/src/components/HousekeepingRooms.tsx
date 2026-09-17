import React from 'react';
import {
  apiClient,
  type HousekeepingOperationalState,
  type HousekeepingRoomRead,
  type HousekeepingRoomStatus,
  type HousekeepingRoomsOverview,
} from '@kajovo/shared';

const PRAGUE_TIME_ZONE = 'Europe/Prague';
const FLOOR_ORDER = ['3', '2', '1', '0'];

const OPERATIONAL_LABELS: Record<HousekeepingOperationalState, string> = {
  checkout_departed_dirty: 'Check-out – odjel (neuklizený)',
  checkout_departed_clean: 'Check-out – odjel (uklizený)',
  checkout_pending: 'Check-out – neodjel',
  occupied: 'Obsazen',
  free: 'Volný',
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

function SuitcaseIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6V4h6v2M5 7h14a2 2 0 0 1 2 2v10H3V9a2 2 0 0 1 2-2Zm3 0v12m8-12v12M3 11h18" />
    </svg>
  );
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
  onSelect: (room: HousekeepingRoomRead) => void;
};

const RoomCard = React.memo(function RoomCard({ room, onSelect }: RoomCardProps): JSX.Element {
  const label = OPERATIONAL_LABELS[room.operational_state];
  return (
    <button
      className={`k-hk-room k-hk-room--${room.operational_state}`}
      type="button"
      onClick={() => onSelect(room)}
      aria-label={`Pokoj ${room.room_number}, ${label}. Změnit stav pokoje.`}
    >
      <span className="k-hk-room__topline">
        <strong>{room.room_number}</strong>
        {room.arrival_today ? <span className="k-hk-room__arrival" title="Nájezd dnes"><SuitcaseIcon /></span> : null}
        <span className="k-hk-room__chevron" aria-hidden="true">›</span>
      </span>
      <span className="k-hk-room__state"><i aria-hidden="true" />{label}</span>
      <span className="k-hk-room__meta">
        <span>{room.guest_label ?? '—'}</span>
        {room.persons > 0 ? <span className="k-hk-room__persons"><GuestIcon /> {room.persons}</span> : null}
      </span>
      {room.housekeeping_status ? <span className="k-hk-room__housekeeping">{room.housekeeping_status}</span> : null}
    </button>
  );
});

export type HousekeepingRoomsProps = {
  canWrite?: boolean;
};

export function HousekeepingRooms({ canWrite = true }: HousekeepingRoomsProps): JSX.Element {
  const [selectedDate, setSelectedDate] = React.useState(todayInPrague);
  const [overview, setOverview] = React.useState<HousekeepingRoomsOverview | null>(null);
  const [selectedRoom, setSelectedRoom] = React.useState<HousekeepingRoomRead | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [savingStatus, setSavingStatus] = React.useState<HousekeepingRoomStatus | null>(null);

  const loadRooms = React.useCallback(async (dateValue: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.getHousekeepingRoomsApiV1HousekeepingRoomsGet({ date: dateValue });
      setOverview(response);
    } catch {
      setError('Přehled pokojů se nepodařilo načíst. Zkontrolujte připojení a zkuste to znovu.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadRooms(selectedDate);
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
    if (!selectedRoom || !canWrite) return;
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
      setSelectedRoom(updated);
    } catch {
      setError('Změnu stavu se nepodařilo bezpečně uložit a ověřit v Better Hotel.');
    } finally {
      setSavingStatus(null);
    }
  };

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
        <button type="button" onClick={() => setSelectedDate((value) => shiftDate(value, -1))} aria-label="Předchozí den">‹</button>
        <label>
          <span aria-hidden="true">▣</span>
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} aria-label="Vybraný den" />
          <strong>{formatDate(selectedDate)}</strong>
        </label>
        <button type="button" onClick={() => setSelectedDate((value) => shiftDate(value, 1))} aria-label="Následující den">›</button>
        <button className="k-hk-datebar__today" type="button" onClick={() => setSelectedDate(todayInPrague())}>Dnes</button>
      </div>
      <div className="k-hk-legend" aria-label="Legenda stavů">
        {([
          ['checkout_departed_dirty', 'Check-out – odjel (neuklizený)'],
          ['checkout_departed_clean', 'Check-out – odjel (uklizený)'],
          ['checkout_pending', 'Check-out – neodjel'],
          ['arrival', 'Nájezd dnes'],
          ['occupied', 'Obsazen'],
          ['free', 'Volný'],
        ] as const).map(([key, label]) => (
          <span key={key} className={`k-hk-legend__item k-hk-legend__item--${key}`}>
            {key === 'arrival' ? <SuitcaseIcon /> : <i aria-hidden="true" />}{label}
          </span>
        ))}
      </div>
      {error ? <div className="k-hk-alert" role="alert">{error}<button type="button" onClick={() => void loadRooms(selectedDate)}>Zkusit znovu</button></div> : null}
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
              {rooms.map((room) => <RoomCard key={room.room_id} room={room} onSelect={setSelectedRoom} />)}
            </div>
          </section>
        );
      }) : null}
      {overview?.housekeeping_status_is_current ? <p className="k-hk-board__source-note">Rezervační stav odpovídá vybranému dni; stav úklidu je vždy aktuální stav z Better Hotel.</p> : null}
      <footer className="k-hk-board__thanks"><span aria-hidden="true">❧</span><strong>Děkujeme, že pomáháte vytvářet domov na cestách.</strong><small>Váš úklid dělá velký rozdíl.</small></footer>

      {selectedRoom ? (
        <div className="k-hk-modal" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedRoom(null); }}>
          <div className="k-hk-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="k-hk-room-dialog-title">
            <header>
              <div><span>Pokoj</span><h3 id="k-hk-room-dialog-title">{selectedRoom.room_number}</h3></div>
              <button type="button" onClick={() => setSelectedRoom(null)} aria-label="Zavřít dialog">×</button>
            </header>
            <p className="k-hk-modal__current">Aktuální stav úklidu: <strong>{selectedRoom.housekeeping_status ?? 'Neurčen'}</strong></p>
            <div className="k-hk-status-actions">
              {STATUS_ACTIONS.map((action) => (
                <button key={action.value} type="button" onClick={() => void updateStatus(action.value)} disabled={!canWrite || savingStatus !== null}>
                  <strong>{action.label}</strong><span>{action.detail}</span>
                  {savingStatus === action.value ? <em>Ukládám…</em> : null}
                </button>
              ))}
            </div>
            {!canWrite ? <p className="k-hk-modal__readonly">Aktivní role může přehled pouze číst.</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
