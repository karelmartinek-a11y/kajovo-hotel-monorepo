import React from 'react';
import { Card, DataTable, FormField, SkeletonPage, StateView } from '@kajovo/ui';

const portalRoleOptions = ['pokojská', 'údržba', 'recepce', 'snídaně', 'sklad'] as const;
type PortalRole = (typeof portalRoleOptions)[number];

const portalRoleLabels: Record<PortalRole, string> = {
  'pokojská': 'Pokojská',
  'údržba': 'Údržba',
  recepce: 'Recepce',
  'snídaně': 'Snídaně',
  sklad: 'Sklad',
};

type PortalUser = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  roles: PortalRole[];
  role: string;
  phone: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  last_login_at: string | null;
};

type PortalUserUpsertPayload = {
  first_name: string;
  last_name: string;
  email: string;
  roles: PortalRole[];
  phone?: string;
  note?: string;
};

type PortalUserCreatePayload = PortalUserUpsertPayload & {
  password: string;
};

class HttpError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail: unknown = null) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function readCsrfToken(): string {
  return document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('kajovo_csrf='))
    ?.split('=')[1] ?? '';
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const headers = new Headers(init?.headers ?? {});
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCsrfToken();
    if (csrf && !headers.has('x-csrf-token')) {
      headers.set('x-csrf-token', csrf);
    }
  }
  const response = await fetch(path, {
    ...init,
    method,
    headers,
    credentials: 'include',
  });
  if (!response.ok) {
    const text = await response.text();
    let detail: unknown = text;
    let message = response.statusText || `HTTP ${response.status}`;
    if (text) {
      try {
        const parsed = JSON.parse(text);
        detail = parsed;
        if (parsed && typeof parsed === 'object' && 'detail' in parsed && typeof (parsed as Record<string, unknown>).detail === 'string') {
          message = (parsed as { detail: string }).detail;
        } else if (typeof parsed === 'string') {
          message = parsed;
        }
      } catch (error) {
        message = text;
      }
    }
    throw new HttpError(response.status, message, detail);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString('cs-CZ');
}

function normalizeSearchValue(value: string): string {
  return value
    .toLocaleLowerCase('cs-CZ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizePhoneInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('00')) return `+${trimmed.slice(2)}`;
  if (/^\d+$/.test(trimmed)) {
    if (trimmed.startsWith('420')) {
      return `+${trimmed}`;
    }
    return `+420${trimmed}`;
  }
  return trimmed;
}

function roleToggle(selected: PortalRole[], setter: (value: PortalRole[]) => void, role: PortalRole): void {
  setter(selected.includes(role) ? selected.filter((item) => item !== role) : [...selected, role]);
}

export function UsersAdmin(): JSX.Element {
  const [users, setUsers] = React.useState<PortalUser[] | null>(null);
  const [selected, setSelected] = React.useState<PortalUser | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [filterQuery, setFilterQuery] = React.useState('');

  const [createFirstName, setCreateFirstName] = React.useState('');
  const [createLastName, setCreateLastName] = React.useState('');
  const [createEmail, setCreateEmail] = React.useState('');
  const [createPassword, setCreatePassword] = React.useState('');
  const [createRoles, setCreateRoles] = React.useState<PortalRole[]>([]);
  const [createPhone, setCreatePhone] = React.useState('');
  const [createNote, setCreateNote] = React.useState('');

  const [editFirstName, setEditFirstName] = React.useState('');
  const [editLastName, setEditLastName] = React.useState('');
  const [editEmail, setEditEmail] = React.useState('');
  const [editRoles, setEditRoles] = React.useState<PortalRole[]>([]);
  const [editPhone, setEditPhone] = React.useState('');
  const [editNote, setEditNote] = React.useState('');

  const [pendingDelete, setPendingDelete] = React.useState<PortalUser | null>(null);
  const deleteTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const confirmDeleteRef = React.useRef<HTMLButtonElement | null>(null);

  const canDelete = true;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  const createEmailValid = emailRegex.test(createEmail.trim().toLowerCase());
  const editEmailValid = emailRegex.test(editEmail.trim().toLowerCase());
  const createPhoneValid = createPhone.trim() === '' || e164Regex.test(createPhone.trim());
  const editPhoneValid = editPhone.trim() === '' || e164Regex.test(editPhone.trim());

  const createValid =
    createFirstName.trim().length > 0 &&
    createLastName.trim().length > 0 &&
    createEmailValid &&
    createPassword.length >= 8 &&
    createRoles.length > 0 &&
    createPhoneValid;

  const editValid =
    editFirstName.trim().length > 0 &&
    editLastName.trim().length > 0 &&
    editEmailValid &&
    editRoles.length > 0 &&
    editPhoneValid;

  const normalizedFilter = normalizeSearchValue(filterQuery);

  const filteredUsers = React.useMemo(() => {
    if (!users) {
      return [];
    }
    if (!normalizedFilter) {
      return users;
    }
    return users.filter((user) => {
      const haystack = normalizeSearchValue(
        [
          user.first_name,
          user.last_name,
          `${user.first_name} ${user.last_name}`,
          user.email,
          user.roles.map((role) => portalRoleLabels[role]).join(' '),
        ].join(' ')
      );
      return haystack.includes(normalizedFilter);
    });
  }, [normalizedFilter, users]);

  const editPhoneHintId = 'users-edit-phone-help';
  const createPhoneHintId = 'users-create-phone-help';
  const editPhoneErrorId = 'users-edit-phone-error';
  const createPhoneErrorId = 'users-create-phone-error';
  const editNoteHintId = 'users-edit-note-help';
  const createNoteHintId = 'users-create-note-help';
  const messageRegionId = 'users-admin-messages';

  const buildDescribedBy = (...ids: (string | undefined)[]): string | undefined => {
    const filtered = ids.filter((value): value is string => Boolean(value));
    return filtered.length ? filtered.join(' ') : undefined;
  };

  const selectedRef = React.useRef<PortalUser | null>(null);
  React.useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const syncEdit = React.useCallback((user: PortalUser | null): void => {
    if (!user) {
      setEditFirstName('');
      setEditLastName('');
      setEditEmail('');
      setEditRoles([]);
      setEditPhone('');
      setEditNote('');
      return;
    }
    setEditFirstName(user.first_name);
    setEditLastName(user.last_name);
    setEditEmail(user.email);
    setEditRoles(user.roles);
    setEditPhone(user.phone ?? '');
    setEditNote(user.note ?? '');
  }, []);

  const load = React.useCallback(() => {
    setError(null);
    void requestJson<PortalUser[]>('/api/v1/users')
      .then((items) => {
        setUsers(items);
        const previousSelection = selectedRef.current;
        const nextSelected = previousSelection
          ? items.find((item) => item.id === previousSelection.id) ?? items[0] ?? null
          : items[0] ?? null;
        setSelected(nextSelected);
        syncEdit(nextSelected);
      })
      .catch((err) => {
        if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
          setError('Nemáte oprávnění zobrazit uživatele nebo nejste přihlášení.');
          return;
        }
        setError('Nepodařilo se načíst uživatele.');
      });
  }, [syncEdit]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function createUser(): Promise<void> {
    if (!createValid) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: PortalUserCreatePayload = {
        first_name: createFirstName.trim(),
        last_name: createLastName.trim(),
        email: createEmail.trim().toLowerCase(),
        password: createPassword,
        roles: createRoles,
        ...(createPhone.trim() ? { phone: createPhone.trim() } : {}),
        ...(createNote.trim() ? { note: createNote.trim() } : {}),
      };
      const created = await requestJson<PortalUser>('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUsers((prev) => (prev ? [...prev, created] : [created]));
      setSelected(created);
      syncEdit(created);
      setCreateFirstName('');
      setCreateLastName('');
      setCreateEmail('');
      setCreatePassword('');
      setCreateRoles([]);
      setCreatePhone('');
      setCreateNote('');
      setMessage('Uživatel byl vytvořen.');
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 409) {
          setError('Uživatel s tímto e-mailem již existuje.');
        } else if (err.status === 403) {
          setError('Nemáte oprávnění vytvářet uživatele.');
        } else if (err.status === 401) {
          setError('Není přihlášení nebo došlo k vypršení platnosti. Obnovte stránku.');
        } else if (err.status === 422) {
          setError('Zadaná data nejsou platná. Zkontrolujte prosím formulář.');
        } else {
          setError('Uživatel se nepodařilo vytvořit.');
        }
      } else {
        setError('Uživatel se nepodařilo vytvořit.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveSelectedUser(): Promise<void> {
    if (!selected || !editValid) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: PortalUserUpsertPayload = {
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        email: editEmail.trim().toLowerCase(),
        roles: editRoles,
        ...(editPhone.trim() ? { phone: editPhone.trim() } : {}),
        ...(editNote.trim() ? { note: editNote.trim() } : {}),
      };
      const updated = await requestJson<PortalUser>(`/api/v1/users/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setUsers((prev) => (prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : null));
      setSelected(updated);
      syncEdit(updated);
      setMessage('Uživatel byl upraven.');
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 409) {
          setError('E-mail již používá jiný uživatel.');
        } else if (err.status === 404) {
          setError('Uživatel nebyl nalezen – mohl být mezitím smazán.');
        } else if (err.status === 403) {
          setError('Nemáte oprávnění upravovat uživatele.');
        } else if (err.status === 401) {
          setError('Není přihlášení nebo došlo k vypršení platnosti. Obnovte stránku.');
        } else if (err.status === 422) {
          setError('Zadaná data nejsou platná. Zkontrolujte prosím formulář.');
        } else {
          setError('Uživatel se nepodařilo upravit.');
        }
      } else {
        setError('Uživatel se nepodařilo upravit.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: PortalUser): Promise<void> {
    try {
      const updated = await requestJson<PortalUser>(`/api/v1/users/${user.id}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      setUsers((prev) => (prev ? prev.map((u) => (u.id === user.id ? updated : u)) : null));
      setSelected(updated);
      syncEdit(updated);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 403) {
          setError('Nemáte oprávnění měnit stav uživatele.');
        } else if (err.status === 401) {
          setError('Není přihlášení nebo došlo k vypršení platnosti. Obnovte stránku.');
        } else if (err.status === 404) {
          setError('Uživatel nebyl nalezen.');
        } else {
          setError('Nepodařilo se změnit stav uživatele.');
        }
      } else {
        setError('Nepodařilo se změnit stav uživatele.');
      }
    }
  }

  async function sendPasswordResetLink(user: PortalUser): Promise<void> {
    try {
      await requestJson<{ ok: boolean }>(`/api/v1/users/${user.id}/password/reset-link`, {
        method: 'POST',
      });
      setMessage('Pokud účet existuje a je dostupný e-mail, byl odeslán token pro reset hesla.');
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 403) {
          setError('Nemáte oprávnění odeslat resetovací token.');
        } else if (err.status === 401) {
          setError('Není přihlášení nebo došlo k vypršení platnosti. Obnovte stránku.');
        } else if (err.status === 404) {
          setError('Uživatel nebyl nalezen.');
        } else {
          setError('Odeslání resetovacího tokenu se nezdařilo.');
        }
      } else {
        setError('Odeslání resetovacího tokenu se nezdařilo.');
      }
    }
  }

  function requestDelete(event: React.MouseEvent<HTMLButtonElement>, user: PortalUser): void {
    deleteTriggerRef.current = event.currentTarget;
    setPendingDelete(user);
  }

  function cancelDelete(): void {
    setPendingDelete(null);
  }

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const targetId = pendingDelete.id;
      await requestJson<void>(`/api/v1/users/${targetId}`, { method: 'DELETE' });
      setMessage('Uživatel byl smazán.');
      setPendingDelete(null);
      setSelected((prev) => (prev && prev.id === targetId ? null : prev));
      syncEdit(null);
      load();
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 403) {
          const detail = typeof err.detail === 'string' ? err.detail : '';
          if (detail.includes('own account')) {
            setError('Nelze smazat vlastní účet.');
          } else {
            setError('Nemáte oprávnění smazat tohoto uživatele.');
          }
        } else if (err.status === 401) {
          setError('Není přihlášení nebo došlo k vypršení platnosti. Obnovte stránku.');
        } else if (err.status === 404) {
          setError('Uživatel nebyl nalezen – mohl být mezitím odstraněn.');
        } else if (err.status === 409) {
          const detail = typeof err.detail === 'string' ? err.detail : '';
          if (detail.includes('last admin')) {
            setError('Poslední administrátorský účet nelze smazat.');
          } else {
            setError('Primární administrátorský účet nelze smazat.');
          }
        } else {
          setError('Smazání uživatele se nepodařilo.');
        }
      } else {
        setError('Smazání uživatele se nepodařilo.');
      }
    } finally {
      setSaving(false);
    }
  }

  React.useEffect(() => {
    if (pendingDelete) {
      const frame = window.requestAnimationFrame(() => {
        confirmDeleteRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (deleteTriggerRef.current) {
      deleteTriggerRef.current.focus();
    }
    return undefined;
  }, [pendingDelete]);

  function handleDeleteDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelDelete();
    }
  }

  function scrollToSection(id: string): void {
    if (typeof document === 'undefined') return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectUser(user: PortalUser): void {
    setSelected(user);
    syncEdit(user);
    scrollToSection('users-detail');
  }

  return (
    <main className="k-page" data-testid="users-admin-page">
      <h1>Uživatelé</h1>
      {(error || message) ? (
        <div id={messageRegionId} aria-live="polite" aria-atomic="true">
          {error ? (
            <StateView
              title="Chyba"
              description={error}
              stateKey="error"
              action={
                <button className="k-button secondary" type="button" onClick={load}>
                  Zkusit znovu
                </button>
              }
            />
          ) : null}
          {message ? <StateView title="Info" description={message} stateKey="info" /> : null}
        </div>
      ) : null}
      {users === null ? (
        <SkeletonPage />
      ) : (
        <div className="k-grid cards-2">
          <Card title="Seznam uživatelů">
            <div className="k-toolbar">
              <button className="k-button" type="button" onClick={() => scrollToSection('users-create')}>
                Nový
              </button>
              <input
                className="k-input"
                type="search"
                value={filterQuery}
                onChange={(event) => setFilterQuery(event.target.value)}
                placeholder="Hledat jméno, email nebo roli"
                aria-label="Filtrovat uživatele"
              />
              {normalizedFilter ? (
                <button className="k-button secondary" type="button" onClick={() => setFilterQuery('')}>
                  Zrušit filtr
                </button>
              ) : null}
            </div>
            {users.length === 0 ? (
              <StateView
                title="Prázdný stav"
                description="Zatím neexistují žádní uživatelé portálu."
                stateKey="empty"
              />
            ) : filteredUsers.length === 0 ? (
              <StateView title="Nenalezeno" description="Filtru neodpovídá žádný uživatel." stateKey="empty" />
            ) : (
              <DataTable
                headers={['Jméno', 'Příjmení', 'Email', 'Role', 'Poslední přihlášení', 'Stav', 'Akce']}
                rows={filteredUsers.map((user) => [
                  <button key={`first-${user.id}`} className="k-nav-link" type="button" onClick={() => selectUser(user)}>
                    {user.first_name}
                  </button>,
                  user.last_name,
                  user.email,
                  user.roles.map((role) => portalRoleLabels[role]).join(', '),
                  formatDateTime(user.last_login_at),
                  user.is_active ? 'Aktivní' : 'Neaktivní',
                  <button
                    key={`edit-${user.id}`}
                    className="k-button secondary"
                    type="button"
                    onClick={() => selectUser(user)}
                  >
                    Upravit
                  </button>,
                ])}
              />
            )}
          </Card>

          <div id="users-detail">
            <Card title="Detail / Úprava">
              {!selected ? (
                <p>Vyberte uživatele.</p>
              ) : (
                <div className="k-form-grid">
                  <FormField id="edit_first_name" label="Jméno">
                    <input
                      id="edit_first_name"
                      className="k-input"
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                    />
                  </FormField>
                  <FormField id="edit_last_name" label="Příjmení">
                    <input
                      id="edit_last_name"
                      className="k-input"
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                    />
                  </FormField>
                  <FormField id="edit_email" label="Email">
                    <input id="edit_email" className="k-input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                  </FormField>
                  {!editEmailValid ? <small>Neplatný email.</small> : null}
                  <FormField id="edit_phone" label="Telefon (E.164, volitelný)">
                    <input
                      id="edit_phone"
                      className="k-input"
                      value={editPhone}
                      onChange={(e) => setEditPhone(normalizePhoneInput(e.target.value))}
                      placeholder="+420123456789"
                      aria-describedby={buildDescribedBy(editPhoneHintId, !editPhoneValid ? editPhoneErrorId : undefined)}
                    />
                  </FormField>
                  <small id={editPhoneHintId}>Např. +420123456789. Při zadání bez předvolby doplníme +420.</small>
                  {!editPhoneValid ? <small id={editPhoneErrorId}>Telefon musí být ve formátu E.164.</small> : null}
                  <FormField id="edit_last_login" label="Poslední přihlášení">
                    <input id="edit_last_login" className="k-input" value={formatDateTime(selected.last_login_at)} readOnly />
                  </FormField>
                  <FormField id="edit_note" label="Poznámka (volitelně)">
                    <textarea
                      id="edit_note"
                      className="k-input"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      aria-describedby={editNoteHintId}
                    />
                  </FormField>
                  <small id={editNoteHintId}>Admin přístup se nastavuje mimo role portálu.</small>
                  <fieldset className="k-card">
                    <legend>Role</legend>
                    {portalRoleOptions.map((role) => (
                      <label key={`edit-role-${role}`} className="k-role-label">
                        <input type="checkbox" checked={editRoles.includes(role)} onChange={() => roleToggle(editRoles, setEditRoles, role)} />
                        {portalRoleLabels[role]}
                      </label>
                    ))}
                  </fieldset>
                  <small>Admin přístup se nastavuje mimo role portálu.</small>
                  <div className="k-toolbar">
                    <button className="k-button" type="button" onClick={() => void saveSelectedUser()} disabled={!editValid || saving}>
                      Upravit
                    </button>
                    <button className="k-button secondary" type="button" onClick={() => void toggleActive(selected)}>
                      {selected.is_active ? 'Zakázat' : 'Povolit'}
                    </button>
                    <button className="k-button secondary" type="button" onClick={() => void sendPasswordResetLink(selected)}>
                      Odeslat token pro reset hesla
                    </button>
                    {canDelete ? (
                      <button
                        className="k-button secondary"
                        type="button"
                        onClick={(event) => requestDelete(event, selected)}
                      >
                        Smazat
                      </button>
                    ) : (
                      <small>Smazání je dostupné pouze pro admina.</small>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div id="users-create">
            <Card title="Vytvořit uživatele">
              <div className="k-form-grid">
                <FormField id="create_first_name" label="Jméno">
                  <input
                    id="create_first_name"
                    className="k-input"
                    value={createFirstName}
                    onChange={(e) => setCreateFirstName(e.target.value)}
                  />
                </FormField>
                <FormField id="create_last_name" label="Příjmení">
                  <input
                    id="create_last_name"
                    className="k-input"
                    value={createLastName}
                    onChange={(e) => setCreateLastName(e.target.value)}
                  />
                </FormField>
                <FormField id="create_email" label="Email">
                  <input id="create_email" className="k-input" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
                </FormField>
                {!createEmailValid && createEmail.trim() ? <small>Neplatný email.</small> : null}
                <FormField id="create_password" label="Dočasné heslo">
                  <input
                    id="create_password"
                    className="k-input"
                    type="password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                  />
                </FormField>
                <FormField id="create_phone" label="Telefon (E.164, volitelný)">
                  <input
                    id="create_phone"
                    className="k-input"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(normalizePhoneInput(e.target.value))}
                    placeholder="+420123456789"
                    aria-describedby={buildDescribedBy(createPhoneHintId, !createPhoneValid ? createPhoneErrorId : undefined)}
                  />
                </FormField>
                <small id={createPhoneHintId}>Např. +420123456789. Při zadání bez předvolby doplníme +420.</small>
                {!createPhoneValid ? <small id={createPhoneErrorId}>Telefon musí být ve formátu E.164.</small> : null}
                <FormField id="create_note" label="Poznámka (volitelně)">
                  <textarea
                    id="create_note"
                    className="k-input"
                    value={createNote}
                    onChange={(e) => setCreateNote(e.target.value)}
                    aria-describedby={createNoteHintId}
                  />
                </FormField>
                <fieldset className="k-card">
                  <legend>Role</legend>
                  {portalRoleOptions.map((role) => (
                    <label key={`create-role-${role}`} className="k-role-label">
                      <input type="checkbox" checked={createRoles.includes(role)} onChange={() => roleToggle(createRoles, setCreateRoles, role)} />
                      {portalRoleLabels[role]}
                    </label>
                  ))}
                </fieldset>
                <small id={createNoteHintId}>Admin přístup se nastavuje mimo role portálu.</small>
                <button className="k-button" type="button" onClick={() => void createUser()} disabled={!createValid || saving}>
                  Vytvořit uživatele
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}
      {pendingDelete ? (
        <div
          className="k-card"
          data-testid="confirm-delete-card"
          aria-labelledby="confirm-delete-title"
          aria-describedby="confirm-delete-description"
          role="alertdialog"
          aria-modal="true"
          onKeyDown={handleDeleteDialogKeyDown}
        >
          <h2 id="confirm-delete-title">Potvrdit smazání</h2>
          <p id="confirm-delete-description">
            Opravdu chcete smazat uživatele <strong>{pendingDelete.email}</strong>? Operaci nelze vrátit, ale účet je možné vytvořit znovu.
          </p>
          <div className="k-toolbar">
            <button
              ref={confirmDeleteRef}
              className="k-button"
              type="button"
              onClick={() => {
                void confirmDelete();
              }}
              disabled={saving}
            >
              Smazat
            </button>
            <button className="k-button secondary" type="button" onClick={cancelDelete} disabled={saving}>
              Zrušit
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
