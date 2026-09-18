import React from 'react';
import type { PortalUserRead, PortalUserCreate } from '@kajovo/shared';
import { TaskDialog } from '@kajovo/ui';

const ROLES = ['admin', 'pokojská', 'údržba', 'recepce', 'snídaně', 'sklad'] as const;
const LABELS: Record<string, string> = { admin: 'Administrátor', pokojská: 'Pokojská', údržba: 'Údržba', recepce: 'Recepce', snídaně: 'Snídaně', sklad: 'Sklad' };
const ALIASES: Record<string, string> = { pokojska: 'pokojská', udrzba: 'údržba', snidane: 'snídaně' };
const canonical = (role: string) => ALIASES[role] ?? role;
const roleLabel = (role: string) => LABELS[canonical(role)] ?? role;
const searchValue = (value: string) => value.toLocaleLowerCase('cs-CZ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Dosud nepřihlášen';
const lockState = (user: PortalUserRead) => user.is_locked
  ? `Blokováno${user.portal_locked_until ? `: portál do ${dateTime(user.portal_locked_until)}` : ''}${user.admin_locked_until ? `; administrace do ${dateTime(user.admin_locked_until)}` : ''}`
  : 'Odemčeno';
const normalizePhone = (value: string) => {
  const phone = value.trim();
  if (!phone || phone.startsWith('+')) return phone;
  if (phone.startsWith('00')) return `+${phone.slice(2)}`;
  return /^\d+$/.test(phone) ? `+${phone.startsWith('420') ? '' : '420'}${phone}` : phone;
};

async function request<T>(path = '', method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const csrf = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('kajovo_csrf='));
    if (csrf) headers['x-csrf-token'] = decodeURIComponent(csrf.slice('kajovo_csrf='.length));
  }
  const response = await fetch(`/api/v1/users${path}`, { method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const fallback = response.status === 401 ? 'Přihlášení vypršelo. Přihlaste se znovu.' : response.status === 403 ? 'Nemáte oprávnění k této akci.' : 'Požadavek se nepodařilo dokončit. Zkontrolujte připojení a zkuste to znovu.';
    throw new Error(typeof payload?.detail === 'string' ? payload.detail : response.status === 422 ? 'Zkontrolujte zadané údaje a jejich délku.' : fallback);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

type Draft = { first_name: string; last_name: string; email: string; roles: string[]; phone: string; note: string; password: string; confirmAdmin: boolean };
const blank = (): Draft => ({ first_name: '', last_name: '', email: '', roles: [], phone: '', note: '', password: '', confirmAdmin: false });
const fromUser = (user: PortalUserRead): Draft => ({ ...blank(), first_name: user.first_name, last_name: user.last_name, email: user.email, roles: Array.from(new Set(user.roles.map(canonical))), phone: user.phone ?? '', note: user.note ?? '' });
const errorsFor = (draft: Draft, create: boolean): Partial<Record<keyof Draft, string>> => {
  const errors: Partial<Record<keyof Draft, string>> = {};
  for (const key of ['first_name', 'last_name'] as const) if (!draft[key].trim() || draft[key].length > 120) errors[key] = 'Vyplňte 1 až 120 znaků.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) || draft.email.length > 255) errors.email = 'Zadejte platný e-mail (nejvýše 255 znaků).';
  if (!draft.roles.length) errors.roles = 'Vyberte alespoň jednu roli.';
  if (create && draft.roles.includes('admin') && !draft.confirmAdmin) errors.confirmAdmin = 'Potvrďte udělení administrátorských práv.';
  if (draft.phone && !/^\+[1-9]\d{1,14}$/.test(normalizePhone(draft.phone))) errors.phone = 'Zadejte telefon ve formátu +420123456789.';
  if (draft.note.length > 4000) errors.note = 'Poznámka může mít nejvýše 4 000 znaků.';
  if (create && draft.password.trim() && (draft.password.trim().length < 8 || draft.password.length > 255)) errors.password = 'Dočasné heslo musí mít 8 až 255 znaků.';
  return errors;
};
const STEP_FIELDS: Array<Array<keyof Draft>> = [['first_name', 'last_name', 'email'], ['roles', 'confirmAdmin'], ['phone', 'password', 'note']];

export function UsersAdmin(): JSX.Element {
  const [users, setUsers] = React.useState<PortalUserRead[] | null>(null);
  const [filter, setFilter] = React.useState('');
  const [view, setView] = React.useState<'list' | 'create' | 'edit'>('list');
  const [selected, setSelected] = React.useState<PortalUserRead | null>(null);
  const [draft, setDraft] = React.useState<Draft>(blank);
  const initial = React.useRef(JSON.stringify(blank()));
  const [step, setStep] = React.useState(0);
  const [attempted, setAttempted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [dialog, setDialog] = React.useState<'discard' | 'delete' | 'mail' | null>(null);
  const [dialogError, setDialogError] = React.useState('');
  const [mailMessage, setMailMessage] = React.useState('');
  const heading = React.useRef<HTMLHeadingElement>(null);
  const dirty = view !== 'list' && JSON.stringify(draft) !== initial.current;
  const errors = errorsFor(draft, view === 'create');

  const load = React.useCallback(async () => {
    setError('');
    try { setUsers(await request<PortalUserRead[]>()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Uživatele se nepodařilo načíst.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => { heading.current?.focus(); }, [view, step]);
  React.useEffect(() => { if (error) heading.current?.scrollIntoView({ block: 'start' }); }, [error]);
  React.useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const followLink = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('a[href]')) return;
      if (!window.confirm('Máte neuložené změny. Opravdu chcete odejít?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', followLink, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', followLink, true); };
  }, [dirty]);

  function openEditor(user: PortalUserRead | null) {
    const value = user ? fromUser(user) : blank();
    setSelected(user); setDraft(value); initial.current = JSON.stringify(value);
    setView(user ? 'edit' : 'create'); setStep(0); setAttempted(false); setError(''); setMessage('');
    window.scrollTo({ top: 0 });
  }
  function backToList() { setView('list'); setDialog(null); setError(''); }
  function leave() { if (dirty) { setDialogError(''); setDialog('discard'); } else backToList(); }
  function change<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((old) => ({ ...old, [key]: value })); }
  function nextStep() { setAttempted(true); if (STEP_FIELDS[step].some((key) => errors[key])) return; setStep(step + 1); setAttempted(false); }
  async function run(work: () => Promise<void>, inDialog = false) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setDialogError('');
    try { await work(); }
    catch (reason) { const text = reason instanceof Error ? reason.message : 'Akce se nezdařila. Zkuste to znovu.'; if (inDialog) setDialogError(text); else setError(text); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function replaceUser(user: PortalUserRead) {
    setUsers((old) => old?.map((item) => item.id === user.id ? user : item) ?? [user]); setSelected(user);
  }
  function save() {
    setAttempted(true);
    const failedStep = STEP_FIELDS.findIndex((fields) => fields.some((key) => errors[key]));
    if (failedStep >= 0) { setStep(failedStep); return; }
    void run(async () => {
      const payload: PortalUserCreate = { first_name: draft.first_name.trim(), last_name: draft.last_name.trim(), email: draft.email.trim().toLowerCase(), roles: draft.roles, phone: normalizePhone(draft.phone) || null, note: draft.note.trim() || null,
        ...(view === 'create' && draft.password.trim() ? { password: draft.password.trim() } : {}) };
      const user = await request<PortalUserRead>(view === 'create' ? '' : `/${selected!.id}`, view === 'create' ? 'POST' : 'PATCH', payload);
      if (view === 'create') setUsers((old) => [...(old ?? []), user].sort((a, b) => a.email.localeCompare(b.email))); else replaceUser(user);
      initial.current = JSON.stringify(draft); backToList(); setMessage('Uživatel byl úspěšně uložen.');
    });
  }
  function accountAction(action: 'active' | 'unlock' | 'mail' | 'delete') {
    if (!selected) return;
    if (action === 'mail') { setDialog('mail'); setMailMessage(''); }
    void run(async () => {
      if (action === 'delete') { await request(`/${selected.id}`, 'DELETE'); setUsers((old) => old?.filter((item) => item.id !== selected.id) ?? []); backToList(); setMessage('Uživatel byl smazán.'); }
      else if (action === 'mail') { const result = await request<{ message: string }>(`/${selected.id}/password/reset-link`, 'POST'); setMailMessage(result.message); }
      else { const user = await request<PortalUserRead>(`/${selected.id}/${action}`, action === 'active' ? 'PATCH' : 'POST', action === 'active' ? { is_active: !selected.is_active } : undefined); replaceUser(user); setMessage(action === 'unlock' ? 'Účet byl odblokován.' : 'Přístup uživatele byl změněn.'); }
    }, action === 'delete' || action === 'mail');
  }
  const visibleUsers = (users ?? []).filter((user) => searchValue([user.first_name, user.last_name, user.email, ...user.roles.map(roleLabel)].join(' ')).includes(searchValue(filter)));
  const field = (key: 'first_name' | 'last_name' | 'email' | 'phone' | 'password', label: string, type = 'text', maxLength = 120) => <div className="k-users-field">
    <label htmlFor={`${view}_${key}`}>{label}</label><input id={`${view}_${key}`} type={type} maxLength={maxLength} value={draft[key]} disabled={busy}
      autoComplete={key === 'password' ? 'new-password' : key === 'email' ? 'email' : key === 'phone' ? 'tel' : key === 'first_name' ? 'given-name' : 'family-name'}
      aria-invalid={attempted && Boolean(errors[key])} aria-describedby={attempted && errors[key] ? `${view}_${key}_error` : undefined}
      onBlur={() => { if (key === 'phone') change('phone', normalizePhone(draft.phone)); }} onChange={(event) => change(key, event.target.value)} />
    {attempted && errors[key] ? <small id={`${view}_${key}_error`} className="k-users-error">{errors[key]}</small> : null}
  </div>;

  return <main className="k-page k-workspace k-users" data-testid="users-admin-page">
    {view !== 'list' ? <button type="button" className="k-users-back" onClick={leave} disabled={busy}>← Zpět na uživatele</button> : null}
    <header className="k-users-heading"><h1 ref={heading} tabIndex={-1}>{view === 'list' ? 'Uživatelé' : view === 'create' ? 'Nový uživatel' : 'Upravit uživatele'}</h1>
      {view === 'list' ? <button className="k-button" type="button" onClick={() => openEditor(null)}>Nový uživatel</button> : null}</header>
    {error ? <div className="k-users-notice k-users-error" role="alert">{error}{users === null ? <button onClick={() => void load()}>Zkusit znovu</button> : null}</div> : null}
    {message ? <div className="k-users-notice" role="status">{message}<button aria-label="Zavřít oznámení" onClick={() => setMessage('')}>×</button></div> : null}
    {view === 'list' ? <>
      <div className="k-users-search"><label htmlFor="users-search">Hledat uživatele</label><input id="users-search" type="search" aria-label="Filtrovat uživatele" placeholder="Jméno, e-mail nebo role" value={filter} onChange={(event) => setFilter(event.target.value)} />{filter ? <button onClick={() => setFilter('')}>Zrušit filtr</button> : null}</div>
      {users === null ? <p role="status">Načítám uživatele…</p> : visibleUsers.length === 0 ? <p>{users.length ? 'Filtru neodpovídá žádný uživatel.' : 'Zatím neexistují žádní uživatelé.'}</p> : <table className="k-users-table">
        <caption className="k-nav-sr-only">Seznam uživatelů</caption><thead><tr>{['Uživatel', 'Role', 'Poslední přihlášení', 'Přístup', 'Blokace', 'Akce'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{visibleUsers.map((user) => <tr key={user.id}>
          <td data-label="Uživatel"><strong>{user.first_name} {user.last_name}</strong><span>{user.email}</span></td>
          <td data-label="Role">{user.roles.map(roleLabel).join(', ')}</td><td data-label="Poslední přihlášení">{dateTime(user.last_login_at)}</td>
          <td data-label="Přístup"><span className={`k-users-status${user.is_active ? '' : ' k-users-status--inactive'}`}>{user.is_active ? 'Aktivní' : 'Neaktivní'}</span></td>
          <td data-label="Blokace">{lockState(user)}</td><td data-label="Akce"><button className="k-button secondary" onClick={() => openEditor(user)}>Upravit<span className="k-nav-sr-only">: {user.first_name} {user.last_name}</span></button></td>
        </tr>)}</tbody></table>}
      {users ? <p className="k-users-count">Zobrazeno {visibleUsers.length} z {users.length} uživatelů</p> : null}
    </> : <div className="k-users-editor">
      <nav className="k-users-steps" aria-label="Kroky formuláře">{['Údaje', 'Role', 'Další'].map((label, index) => <button type="button" key={label} disabled={busy} aria-current={step === index ? 'step' : undefined} onClick={() => { if (index <= step) { setStep(index); setAttempted(false); } else { setAttempted(true); const invalid = STEP_FIELDS.slice(0, index).findIndex((keys) => keys.some((key) => errors[key])); if (invalid < 0) { setStep(index); setAttempted(false); } else setStep(invalid); } }}><span>{index + 1}</span>{label}</button>)}</nav>
      <form noValidate onSubmit={(event) => { event.preventDefault(); if (step < 2) nextStep(); else save(); }}>
        <fieldset disabled={busy} className="k-users-fields"><legend>{['Základní údaje', 'Přístupové role', 'Další údaje'][step]}</legend>
          {step === 0 ? <>{field('first_name', 'Jméno *')}{field('last_name', 'Příjmení *')}{field('email', 'E-mail *', 'email', 255)}</> : null}
          {step === 1 ? <><div className="k-users-roles">{ROLES.map((role) => <label key={role}><input type="checkbox" checked={draft.roles.includes(role)} onChange={() => setDraft((old) => ({ ...old, roles: old.roles.includes(role) ? old.roles.filter((item) => item !== role) : [...old.roles, role], confirmAdmin: role === 'admin' ? false : old.confirmAdmin }))} />{LABELS[role]}</label>)}</div>
            {attempted && errors.roles ? <p className="k-users-error" role="alert">{errors.roles}</p> : null}
            {view === 'create' && draft.roles.includes('admin') ? <label className="k-users-confirm"><input type="checkbox" checked={draft.confirmAdmin} onChange={(event) => change('confirmAdmin', event.target.checked)} />Potvrzuji vědomé udělení administrátorských práv.</label> : null}
            {attempted && errors.confirmAdmin ? <p className="k-users-error" role="alert">{errors.confirmAdmin}</p> : null}</> : null}
          {step === 2 ? <>{field('phone', 'Telefon', 'tel', 16)}<small>Číslo bez předvolby doplníme o +420 po opuštění pole.</small>
            {view === 'create' ? <>{field('password', 'Dočasné heslo', 'password', 255)}<small>Volitelné, alespoň 8 znaků. Bez vyplnění se účet vytvoří bez dočasného hesla.</small></> : null}
            <div className="k-users-field"><label htmlFor={`${view}_note`}>Poznámka</label><textarea id={`${view}_note`} maxLength={4000} rows={5} value={draft.note} onChange={(event) => change('note', event.target.value)} /></div>
            <small>{draft.note.length} / 4 000 znaků</small></> : null}
        </fieldset>
        <footer className="k-users-form-actions"><button type="button" className="k-button secondary" disabled={busy} onClick={step ? () => { setStep(step - 1); setAttempted(false); } : leave}>{step ? 'Zpět' : 'Zrušit'}</button><button className="k-button" type="submit" disabled={busy}>{busy ? 'Ukládám…' : step < 2 ? 'Další' : view === 'create' ? 'Vytvořit uživatele' : 'Uložit změny'}</button></footer>
      </form>
      {view === 'edit' && selected ? <section className="k-users-account"><h2>Účet a přístup</h2><dl><div><dt>Poslední přihlášení</dt><dd>{dateTime(selected.last_login_at)}</dd></div><div><dt>Blokace</dt><dd>{lockState(selected)}</dd></div></dl>
        <p>Tyto akce nemění rozepsané údaje formuláře.</p><div className="k-users-account-actions">
          <button disabled={busy} onClick={() => accountAction('active')}>{selected.is_active ? 'Zakázat' : 'Povolit'} přístup</button>
          {!selected.roles.map(canonical).includes('admin') ? <button disabled={busy} onClick={() => accountAction('mail')}>Odeslat odkaz pro reset hesla</button> : null}
          {selected.is_locked ? <button disabled={busy} onClick={() => accountAction('unlock')}>Odblokovat účet</button> : null}
          <button className="k-users-error" disabled={busy} onClick={() => { setDialogError(''); setDialog('delete'); }}>Smazat uživatele</button>
        </div></section> : null}
    </div>}
    {dialog ? <TaskDialog title={dialog === 'delete' ? 'Smazat uživatele?' : dialog === 'discard' ? 'Zahodit neuložené změny?' : busy ? 'Odesílám resetovací odkaz' : dialogError ? 'Odeslání selhalo' : 'Resetovací odkaz'} busy={busy} onClose={() => setDialog(null)}>
      {dialog === 'delete' ? <><p>Účet <strong>{selected?.email}</strong> bude trvale smazán. Tuto akci nelze vrátit.</p>{dialogError ? <p role="alert" className="k-users-error">{dialogError}</p> : null}<div className="k-users-form-actions"><button disabled={busy} onClick={() => setDialog(null)}>Zrušit</button><button className="k-button" disabled={busy} onClick={() => accountAction('delete')}>{busy ? 'Mažu…' : 'Smazat'}</button></div></> : dialog === 'discard' ? <><p>Údaje dosud nebyly uloženy.</p><div className="k-users-form-actions"><button onClick={() => setDialog(null)}>Pokračovat v úpravách</button><button className="k-button" onClick={backToList}>Zahodit změny</button></div></> : <><p role={dialogError ? 'alert' : 'status'}>{busy ? 'Čekám na potvrzení odeslání e-mailu…' : dialogError || mailMessage}</p>{!busy ? <button className="k-button" onClick={() => setDialog(null)}>Zavřít</button> : null}</>}
    </TaskDialog> : null}
  </main>;
}
