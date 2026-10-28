import React from 'react';
import { TaskDialog } from './TaskDialog';
import {
  apiClient,
  getPortalLocale,
  t,
  type HousekeepingOperationalState,
  type HousekeepingRoomRead,
  type HousekeepingRoomStatus,
  type HousekeepingRoomsOverview,
  type HousekeepingStayRead,
  type ReservationAmenityKind,
} from '@kajovo/shared';
import { DateNavigation, hotelToday } from './DateNavigation';
import { ReservationDetails, ReservationStamp, RESERVATION_LABELS, requirementConfirmed, type StayKind } from './HousekeepingReservation';

const ROOM_ORDER = [
  '101', '102', '103', '104', '105', '106', '107', '108',
  '109', '203', '204', '205', '206', '207', '208', '301',
  '302', '303', '304', '305', '306', '307', '308', '309',
  '310', '221', '222', '223', '224', '321', '322', '323',
  '324', '201', '202', '209', '210',
];
const ROOM_ORDER_INDEX = new Map(ROOM_ORDER.map((number, index) => [number, index]));

const OPERATIONAL_LABELS: Record<HousekeepingOperationalState, string> = {
  checkout_departed_dirty: 'VOLNO',
  checkout_departed_clean: 'VOLNO',
  checkout_pending: 'OBSAZENO-ODJÍŽDÍ',
  checkout_pending_clean: 'OBSAZENO-ODJÍŽDÍ',
  arrived: 'OBSAZENO-PŘIJEL',
  occupied: 'OBSAZENO-POBYT',
  free: 'VOLNO',
};

const STATUS_ACTIONS: Array<{ value: HousekeepingRoomStatus; label: string; detail: string }> = [
  { value: 'clean', label: 'Uklizeno pro nájezd', detail: 'Pokoj je uklizený.' },
  { value: 'dirty', label: 'Neuklizeno', detail: 'Pokoj čeká na úklid.' },
  { value: 'stay_no_linen', label: 'Pobyt bez ložního prádla', detail: 'Bez výměny ložního prádla.' },
  { value: 'stay_with_linen', label: 'Uklizeno s ložním prádlem', detail: 'S výměnou ložního prádla.' },
  { value: 'do_not_disturb', label: 'Nerušenka', detail: 'Host si nepřeje být rušen.' },
  { value: 'technical_issue', label: 'Technický problém', detail: 'Pokoj vyžaduje technický zásah.' },
  { value: 'windows_cleaned', label: 'Umytá okna', detail: 'Okna jsou umytá.' },
  { value: 'painted', label: 'Vymalováno', detail: 'Pokoj je vymalovaný.' },
];

const RoomCard = React.memo(function RoomCard({ room, onSelect, date }: { room: HousekeepingRoomRead; onSelect: (room: HousekeepingRoomRead) => void; locale: string; date: string }): JSX.Element {
  const continuing = !room.departures.length && !room.arrivals.length && room.stays.length > 0;
  const reservations: Array<[StayKind, HousekeepingStayRead[]]> = continuing ? [['stay', room.stays]] : [['departure', room.departures], ['arrival', room.arrivals]];
  const blocks = room.blocks ?? [];
  const fullBlock = blocks.some((block) => block.coverage === 'full');
  const available = ['left', 'right'].filter((side) => !continuing && !(side === 'left' ? room.departures.length : room.arrivals.length));
  const partialCoverage = available.filter((side) => fullBlock || blocks.some((block) => block.coverage === side));
  const coverage = fullBlock && partialCoverage.length === 2 ? ['full'] : partialCoverage;
  const stays = reservations.flatMap(([, items]) => items);
  const statusLabel = t(STATUS_ACTIONS.find((action) => action.value === room.housekeeping_status_key)?.label ?? room.housekeeping_status ?? 'Neurčen');
  const describe = stays.map((stay) => [(stay.guests ?? []).map((guest) => guest.name).filter(Boolean).join(', '), stay.country_code_alpha3 ?? '?', stay.reservation_state ? t(RESERVATION_LABELS[stay.reservation_state]) : '?', `${stay.persons} ${t('Celkem osob')}`,
    ...(['dog', 'cot'] as const).filter((kind) => kind === 'dog' ? (stay.dog_count ?? 0) > 0 : stay.cot_required).map((kind) => `${t(kind === 'dog' ? 'Pes' : 'Dětská postýlka')}: ${t(requirementConfirmed(stay, kind) ? 'Potvrzeno' : 'Nepotvrzeno')}`),
  ].join(', ')).join('; ');
  return <button className={`k-hk-room k-hk-room--stamp${continuing ? ' k-hk-room--stay' : ''}${fullBlock ? ' k-hk-room--blocked' : room.departures.length && room.arrivals.length ? ' k-hk-room--split' : ''}`} type="button" onClick={() => onSelect(room)} data-room-id={room.room_id}
    aria-label={`${t('Pokoj')} ${room.room_number}, ${statusLabel}, ${t(OPERATIONAL_LABELS[room.operational_state])}. ${describe}. ${stays.some((stay) => stay.housekeeping_note?.trim()) ? `${t('Poznámka pro pokojskou')}. ` : ''}${blocks.length ? `${t('Blokace pokoje / zastavení prodeje')}. ` : ''}${t('Změnit stav pokoje.')}`}>
    <span className={`k-hk-room__topline k-hk-room-status--${room.housekeeping_status_key ?? 'unknown'}`} title={statusLabel}><strong>{room.room_number}</strong></span>
    <span className="k-hk-room__body">
      {reservations.map(([kind, items]) => <span key={kind} className={`k-hk-room__slot k-hk-reservation--${items.length === 1 ? items[0].reservation_state ?? 'unknown' : 'unknown'}`}>
        {items.length === 1 ? items[0].reservation_state ? <ReservationStamp stay={items[0]} kind={kind} date={date} /> : <span className="k-hk-room__conflict">{t('Neurčený stav rezervace')}</span> : items.length > 1 ? <span className="k-hk-room__conflict" title={t('Nejednoznačné přiřazení rezervací')}>{t('Více rezervací')}</span> : null}
      </span>)}
      {coverage.map((side) => <svg key={side} className={`k-hk-room__block k-hk-room__block--${side}`} data-block-coverage={side} viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={t('Blokace pokoje / zastavení prodeje')}><title>{t('Blokace pokoje / zastavení prodeje')}</title><path d="M3 3 97 97 M97 3 3 97" /></svg>)}
    </span>
  </button>;
});

export type HousekeepingRoomsProps = {
  canWrite?: boolean;
};

export function HousekeepingRooms({ canWrite = true }: HousekeepingRoomsProps): JSX.Element {
  const [selectedDate, setSelectedDate] = React.useState(hotelToday);
  const [overview, setOverview] = React.useState<HousekeepingRoomsOverview | null>(null);
  const [selectedRoomId, setSelectedRoomId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState('');
  const selectedRoom = overview?.rooms.find((room) => room.room_id === selectedRoomId) ?? null;
  const selectRoom = React.useCallback((room: HousekeepingRoomRead) => { setSelectedRoomId(room.room_id); }, []);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [savingStatus, setSavingStatus] = React.useState<HousekeepingRoomStatus | null>(null);
  const [savingRequirement, setSavingRequirement] = React.useState<ReservationAmenityKind | null>(null);
  const requestSequence = React.useRef(0);
  const savingRef = React.useRef(false);
  const loadRooms = React.useCallback(async (dateValue: string, background = false): Promise<void> => {
    const sequence = ++requestSequence.current;
    if (!background) { setLoading(true); setError(null); }
    try {
      const response = await apiClient.getHousekeepingRoomsApiV1HousekeepingRoomsGet({ date: dateValue, include_options: true, include_blocks: true });
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

  const orderedRooms = React.useMemo(() => [...(overview?.rooms ?? [])].sort((left, right) => {
    const leftRank = ROOM_ORDER_INDEX.get(left.room_number) ?? ROOM_ORDER.length;
    const rightRank = ROOM_ORDER_INDEX.get(right.room_number) ?? ROOM_ORDER.length;
    return leftRank - rightRank || left.room_number.localeCompare(right.room_number, 'cs', { numeric: true }) || left.room_id.localeCompare(right.room_id);
  }), [overview?.rooms]);

  const updateStatus = async (status: HousekeepingRoomStatus): Promise<void> => {
    if (!selectedRoom || !canWrite || savingRef.current) return;
    const expectedStatus = selectedRoom.housekeeping_status_key;
    if (!expectedStatus) {
      setError(t('Změnu se nepodařilo ověřit. Před dalším pokusem obnovte aktuální stav pokoje.'));
      return;
    }
    savingRef.current = true;
    ++requestSequence.current;
    setSavingStatus(status);
    setError(null);
    try {
      const updated = await apiClient.updateHousekeepingRoomStatusApiV1HousekeepingRoomsRoomIdPatch(
        selectedRoom.room_id,
        { date: selectedDate, include_options: true, include_blocks: true },
        { status, expected_status: expectedStatus },
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

  const confirmRequirement = async (stay: HousekeepingStayRead, kind: ReservationAmenityKind): Promise<void> => {
    if (!selectedRoom || !canWrite || error || savingRef.current) return;
    savingRef.current = true;
    ++requestSequence.current;
    setSavingRequirement(kind);
    try {
      const updated = await apiClient.confirmReservationRequirementApiV1HousekeepingReservationsReservationIdRequirementsKindConfirmPost(
        stay.reservation_id, kind, { room_id: selectedRoom.room_id, date: selectedDate },
        { version: stay.amenities?.find((item) => item.kind === kind)?.version ?? 0, quantity: kind === 'dog' ? stay.dog_count! : 1 },
      );
      if (!updated.active || updated.state !== 'green' || updated.kind !== kind) throw new Error('Unverified requirement confirmation');
      const updateStay = (item: HousekeepingStayRead): HousekeepingStayRead => item.reservation_id === stay.reservation_id ? { ...item, amenities: [...(item.amenities ?? []).filter((amenity) => amenity.kind !== kind), updated] } : item;
      setOverview((current) => current ? { ...current, rooms: current.rooms.map((room) => room.room_id === selectedRoom.room_id ? { ...room,
        departures: room.departures.map(updateStay), arrivals: room.arrivals.map(updateStay), stays: room.stays.map(updateStay),
      } : room) } : current);
      setAnnouncement(t('Požadavek byl potvrzen.'));
    } catch {
      setError(t('Potvrzení se nepodařilo ověřit. Před dalším pokusem obnovte aktuální přehled.'));
    } finally {
      setSavingRequirement(null);
      savingRef.current = false;
    }
  };

  const busy = savingStatus !== null || savingRequirement !== null;

  return (
    <section className="k-hk-board" data-testid="housekeeping-rooms-view">
      <div className="k-hk-board__controls"><header className="k-hk-board__header">
        <div>
          <h2>{t("Pokoje")}</h2>
        </div>
      </header>
      <DateNavigation value={selectedDate} onChange={setSelectedDate} disabled={busy} />
      {announcement ? <p className="k-hk-saved" role="status">{announcement}</p> : null}
      <p className="k-hk-board__source-note">{t("Pobyty podle data · Obsazenost a úklid nyní.")}</p>
      </div>
      {error && !selectedRoom ? <div className="k-hk-alert" role="alert">{error}<button type="button" onClick={() => void loadRooms(selectedDate)}>{t("Zkusit znovu")}</button></div> : null}
      {loading ? <div className="k-hk-loading" aria-live="polite">{t("Načítám aktuální přehled pokojů…")}</div> : null}
      {!loading && overview?.rooms.length === 0 ? <div className="k-hk-loading">{t("Better Hotel nevrátil žádné provozní pokoje.")}</div> : null}
      {!loading && orderedRooms.length > 0 ? <div className="k-hk-room-grid" aria-label={t('Pokoje')}>
        {orderedRooms.map((room) => <RoomCard key={room.room_id} room={room} onSelect={selectRoom} locale={getPortalLocale()} date={selectedDate} />)}
      </div> : null}

      {selectedRoom ? <TaskDialog title={busy ? t('Zapisuji změnu…') : `${t('Pokoj')} ${selectedRoom.room_number}`} busy={busy} onClose={() => setSelectedRoomId(null)} className="k-hk-task k-hk-task--sheet">
        {busy ? <div className="k-hk-saving" role="status"><span className="k-modal-spinner" aria-hidden="true" /><p>{savingRequirement ? t('Potvrzuji připravený požadavek…') : <>{t("Ukládám stav pokoje")}{' '}{selectedRoom.room_number}{t(". Po zápisu se vrátíte na přehled.")}</>}</p></div> : <>
          {error ? <div className="k-hk-alert" role="alert"><p>{error}</p><button disabled={loading} onClick={() => void loadRooms(selectedDate, true)}>{t('Obnovit stav')}</button></div> : null}
          {!error ? <div className="k-hk-status-actions">{STATUS_ACTIONS.map((action) => <button key={action.value} className={`k-hk-room-status--${action.value}`} type="button" title={t(action.detail)} aria-label={`${t(action.label)} ${t(action.detail)}`} onClick={() => void updateStatus(action.value)} disabled={!canWrite || busy}><strong>{t(action.label)}</strong></button>)}</div> : null}
          <p className="k-hk-modal__current">{t('Aktuální stav úklidu:')}{' '}<strong>{selectedRoom.housekeeping_status ? t(selectedRoom.housekeeping_status) : t('Neurčen')}</strong></p>
          <div className="k-hk-detail-summary"><strong className={selectedRoom.occupied ? 'k-hk-detail-summary__occupied' : ''}>{selectedRoom.occupied ? `${selectedRoom.current_persons ?? selectedRoom.persons} ${t('Uvnitř teď')}` : t('Prázdný teď')}</strong><span>{t(OPERATIONAL_LABELS[selectedRoom.operational_state])}</span></div>
          {(selectedRoom.blocks ?? []).length ? <section className="k-hk-detail-blocks"><h3>{t('Blokace pokoje / zastavení prodeje')}</h3><ul>{selectedRoom.blocks!.map((block) => <li key={block.block_id}>{block.arrival} – {block.departure} · {t(block.coverage === 'full' ? 'Celý den' : block.coverage === 'left' ? 'Odjezd' : 'Příjezd')}</li>)}</ul></section> : null}
          <div className="k-hk-detail-stays">
            {([['departure', selectedRoom.departures], ['arrival', selectedRoom.arrivals], ['stay', selectedRoom.stays]] as Array<[StayKind, HousekeepingStayRead[]]>).map(([kind, stays]) => stays.map((stay) => <ReservationDetails key={`${kind}-${stay.reservation_id}`} stay={stay} kind={kind} date={selectedDate} onConfirm={canWrite && !error ? (item, requirement) => void confirmRequirement(item, requirement) : undefined} />))}
            {!selectedRoom.departures.length && !selectedRoom.arrivals.length && !selectedRoom.stays.length ? <p>{t('Bez pobytu ve vybraný den')}</p> : null}
          </div>
          {!canWrite ? <p>{t("Aktivní role může přehled pouze číst.")}</p> : null}
        </>}
      </TaskDialog> : null}
    </section>
  );
}
