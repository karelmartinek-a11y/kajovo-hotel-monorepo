import React, { useEffect, useState } from "react";
import type {
  MemoryRead,
  MemoryRequest,
  MemoryResult,
  NoteRecord,
  SettingsRead,
  SummaryRecord,
} from "@kajovo/shared";
import "./voice-memory.css";

const BASE = "/api/v1/admin/voice-memory";
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const csrf =
    document.cookie
      .split("; ")
      .find((v) => v.startsWith("kajovo_csrf="))
      ?.split("=")
      .slice(1)
      .join("=") ?? "";
  const response = await fetch(BASE + path, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(method === "GET" ? {} : { "x-csrf-token": decodeURIComponent(csrf) }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? "Obsah se mezitím změnil. Obnovte data a zkuste úpravu znovu."
        : response.status === 401 || response.status === 403
          ? "Pro správu paměti je nutné přihlášení administrátora."
          : "Paměť není dostupná nebo požadavek nelze uložit.",
    );
  return response.json() as Promise<T>;
}
const date = (value: string) =>
  new Date(value).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
type Tab = "memories" | "notes" | "summaries";
function listPath(area: Tab, offset: number, archived: boolean) {
  const params = new URLSearchParams({
    offset: String(offset),
    archived: String(archived),
  });
  return `/${area}` + "?" + params.toString();
}
export function VoiceMemoryPanel() {
  const [tab, setTab] = useState<Tab>("memories");
  const [result, setResult] = useState<MemoryResult | null>(null);
  const [settings, setSettings] = useState<SettingsRead | null>(null);
  const [memory, setMemory] = useState<MemoryRead | null>(null);
  const [note, setNote] = useState<NoteRecord | null>(null);
  const [summary, setSummary] = useState<SummaryRecord | null>(null);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [item, setItem] = useState("");
  const [offset, setOffset] = useState(0);
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deletion, setDeletion] = useState(false);
  async function load(selected = tab, page = offset) {
    setResult(await api<MemoryResult>(listPath(selected, page, archived)));
  }
  useEffect(() => {
    let active = true;
    void Promise.all([
      api<MemoryResult>(listPath(tab, offset, archived)),
      api<SettingsRead>("/settings"),
    ])
      .then(([rows, config]) => {
        if (active) {
          setResult(rows);
          setSettings(config);
        }
      })
      .catch((error: Error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [tab, offset, archived]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Požadavek se nepodařil.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function mutate(request: MemoryRequest["request"]) {
    const value = await api<MemoryResult>("/operations", "POST", { request });
    if (value.code !== "ok") {
      setMessage(
        value.code === "ambiguous"
          ? "Odpovídá více položek. Vyberte přesný cíl."
          : "Změna nebyla potvrzena.",
      );
      return;
    }
    if (value.memory) setMemory(value.memory ?? null);
    if (value.note) setNote(value.note ?? null);
    await load();
    setMessage("Změna byla uložena.");
  }
  const memoryUpdate = (
    changes: Partial<MemoryRead> = {},
  ): MemoryRequest["request"] => ({
    operation: "memory_update",
    id: memory!.id,
    revision: memory!.revision,
    subject: memory!.subject,
    content: memory!.content,
    tags: memory!.tags,
    status: memory!.status,
    pinned: memory!.pinned,
    importance: memory!.importance,
    ...changes,
  });
  return (
    <section className="voice-memory" aria-label="Správa hlasové paměti">
      <h2>Trvalá paměť</h2>
      <p>
        Soukromá paměť vašeho účtu, lístky a stručné souhrny. Zvuk ani úplné
        přepisy se neukládají.
      </p>
      {settings && (
        <label className="vm-setting">
          <input
            type="checkbox"
            checked={settings.automatic}
            disabled={busy}
            onChange={(event) => {
              const automatic = event.target.checked;
              void run(async () => {
                setSettings(
                  await api<SettingsRead>("/settings", "PUT", {
                    automatic,
                    revision: settings.revision,
                  }),
                );
              });
            }}
          />
          Automaticky vytvářet stručnou paměť a souhrny
        </label>
      )}
      <p className="vm-hint">
        Automatika používá dodatečný přepis a dávkové modelové zpracování.
        Výslovné zápisy a lístky fungují i po jejím vypnutí.
      </p>
      <div role="tablist" aria-label="Oblasti paměti">
        {(
          [
            ["memories", "Paměť"],
            ["notes", "Lístky"],
            ["summaries", "Historie rozhovorů"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              setOffset(0);
              setQuery("");
              setMemory(null);
              setNote(null);
              setSummary(null);
              setMessage("");
              setDeletion(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="vm-search"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            setResult(
              await api<MemoryResult>("/operations", "POST", {
                request:
                  tab === "notes"
                    ? {
                        operation: "note_list",
                        query,
                        archived,
                        limit: 20,
                        offset: 0,
                      }
                    : {
                        operation: "memory_search",
                        query,
                        scope: tab,
                        tags: [],
                        date_from: null,
                        date_to: null,
                        limit: 20,
                      },
              }),
            );
          });
        }}
      >
        <label>
          Hledat v paměti
          <input
            value={query}
            maxLength={160}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button disabled={busy}>Hledat</button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await load();
              if (memory) {
                const value = await api<MemoryResult>(`/memories/${memory.id}`);
                setMemory(value.memory ?? null);
              }
              if (note) {
                const value = await api<MemoryResult>(`/notes/${note.id}`);
                setNote(value.note ?? null);
              }
            })
          }
        >
          Obnovit
        </button>
      </form>
      {tab === "notes" && (
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => {
              setArchived(event.target.checked);
              setNote(null);
              setOffset(0);
            }}
          />
          Zobrazit archivované lístky
        </label>
      )}
      {message && <p role="status">{message}</p>}
      <div className="vm-layout" role="tabpanel">
        <div className="vm-list">
          {tab === "memories" &&
            (result?.memories ?? []).map((row) => (
              <button
                key={row.id}
                onClick={() => {
                  setMemory(row);
                  setDeletion(false);
                }}
              >
                {row.pinned ? "★ " : ""}
                {row.subject}
                <small>
                  {row.status === "active" ? "Aktivní" : "Neaktivní"} ·{" "}
                  {date(row.updated_at)}
                </small>
              </button>
            ))}
          {tab === "notes" &&
            (result?.notes ?? []).map((row) => (
              <button
                key={row.id}
                onClick={() => {
                  void run(async () => {
                    const value = await api<MemoryResult>(`/notes/${row.id}`);
                    setNote(value.note ?? null);
                    setDeletion(false);
                  });
                }}
              >
                {row.title}
                <small>{row.item_count} položek</small>
              </button>
            ))}
          {tab === "summaries" &&
            (result?.summaries ?? []).map((row) => (
              <button key={row.id} onClick={() => setSummary(row)}>
                {date(row.created_at)}
                <small>{row.topics.join(", ")}</small>
              </button>
            ))}
          {result &&
            !(
              result.memories?.length ||
              result.notes?.length ||
              result.summaries?.length
            ) && <p>Žádné položky.</p>}
          {!query && (
            <div className="vm-actions">
              <button
                disabled={busy || offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 20))}
              >
                Předchozí
              </button>
              <button
                disabled={busy || !result?.has_more}
                onClick={() => setOffset(offset + 20)}
              >
                Další
              </button>
            </div>
          )}
          {query && result?.has_more && (
            <p>Další výsledky zobrazíte upřesněním hledání.</p>
          )}
        </div>
        <div className="vm-detail">
          {tab === "memories" && memory && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => mutate(memoryUpdate()));
              }}
            >
              <label>
                Předmět paměti
                <input
                  value={memory.subject}
                  maxLength={160}
                  onChange={(event) =>
                    setMemory({ ...memory, subject: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Obsah paměti
                <textarea
                  aria-label="Obsah paměti"
                  value={memory.content}
                  maxLength={2000}
                  onChange={(event) =>
                    setMemory({ ...memory, content: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={memory.pinned}
                  onChange={(event) =>
                    setMemory({ ...memory, pinned: event.target.checked })
                  }
                />
                Připnout
              </label>
              <div className="vm-actions">
                <button disabled={busy}>Uložit paměť</button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      mutate(
                        memoryUpdate({
                          status:
                            memory.status === "active" ? "inactive" : "active",
                        }),
                      ),
                    )
                  }
                >
                  {memory.status === "active" ? "Deaktivovat" : "Aktivovat"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDeletion(true)}
                >
                  Zapomenout
                </button>
              </div>
              {deletion && (
                <div>
                  <p>
                    Trvale odstranit obsah i jeho historii? Odstraní se také
                    vaše souhrny, které mohou obsah parafrázovat.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await mutate({
                          operation: "memory_forget",
                          id: memory.id,
                          revision: memory.revision,
                        });
                        setMemory(null);
                        setDeletion(false);
                      })
                    }
                  >
                    Potvrdit zapomenutí
                  </button>
                </div>
              )}
            </form>
          )}
          {tab === "notes" && note && (
            <div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(() =>
                    mutate({
                      operation: "note_rename",
                      id: note.id,
                      revision: note.revision,
                      title: note.title,
                    }),
                  );
                }}
              >
                <label>
                  Název lístku
                  <input
                    value={note.title}
                    maxLength={160}
                    required
                    onChange={(event) =>
                      setNote({ ...note, title: event.target.value })
                    }
                  />
                </label>
                <button disabled={busy}>Přejmenovat</button>
              </form>
              {note.kind === "text" ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(() =>
                      mutate({
                        operation: "note_text_update",
                        id: note.id,
                        revision: note.revision,
                        content: note.content ?? "",
                      }),
                    );
                  }}
                >
                  <label>
                    Text lístku
                    <textarea
                      value={note.content ?? ""}
                      onChange={(event) =>
                        setNote({ ...note, content: event.target.value })
                      }
                      maxLength={2000}
                    />
                  </label>
                  <button disabled={busy}>Uložit text</button>
                </form>
              ) : (
                <>
                  <ol>
                    {note.items.map((row, index) => (
                      <li key={row.id}>
                        <label>
                          Položka {index + 1}
                          <input
                            aria-label={`Položka ${index + 1}`}
                            value={row.content}
                            maxLength={2000}
                            onChange={(event) =>
                              setNote({
                                ...note,
                                items: note.items.map((i) =>
                                  i.id === row.id
                                    ? { ...i, content: event.target.value }
                                    : i,
                                ),
                              })
                            }
                          />
                        </label>
                        <div className="vm-actions">
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                mutate({
                                  operation: "note_item_update",
                                  id: note.id,
                                  revision: note.revision,
                                  item_id: row.id,
                                  content: row.content,
                                }),
                              )
                            }
                          >
                            Uložit položku {index + 1}
                          </button>
                          <button
                            disabled={busy || index === 0}
                            onClick={() =>
                              void run(() =>
                                mutate({
                                  operation: "note_item_move",
                                  id: note.id,
                                  revision: note.revision,
                                  item_id: row.id,
                                  position: index - 1,
                                }),
                              )
                            }
                            aria-label={`Posunout položku ${index + 1} nahoru`}
                          >
                            ↑
                          </button>
                          <button
                            disabled={busy || index === note.items.length - 1}
                            onClick={() =>
                              void run(() =>
                                mutate({
                                  operation: "note_item_move",
                                  id: note.id,
                                  revision: note.revision,
                                  item_id: row.id,
                                  position: index + 1,
                                }),
                              )
                            }
                            aria-label={`Posunout položku ${index + 1} dolů`}
                          >
                            ↓
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                mutate({
                                  operation: "note_item_remove",
                                  id: note.id,
                                  revision: note.revision,
                                  item_id: row.id,
                                }),
                              )
                            }
                          >
                            Odstranit položku {index + 1}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        await mutate({
                          operation: "note_item_add",
                          id: note.id,
                          revision: note.revision,
                          content: item,
                          position: null,
                        });
                        setItem("");
                      });
                    }}
                  >
                    <label>
                      Nová položka
                      <input
                        value={item}
                        required
                        maxLength={2000}
                        onChange={(event) => setItem(event.target.value)}
                      />
                    </label>
                    <button disabled={busy}>Přidat položku</button>
                  </form>
                </>
              )}
              <div className="vm-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await mutate({
                        operation: "note_archive",
                        id: note.id,
                        revision: note.revision,
                      });
                      setNote(null);
                    })
                  }
                >
                  Archivovat lístek
                </button>
                <button disabled={busy} onClick={() => setDeletion(true)}>
                  Smazat lístek
                </button>
              </div>
              {deletion && (
                <div>
                  <p>
                    Trvale smazat lístek a položky? Odstraní se také souhrny,
                    které mohou jejich obsah zmiňovat.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await mutate({
                          operation: "note_delete",
                          id: note.id,
                          revision: note.revision,
                        });
                        setNote(null);
                        setDeletion(false);
                      })
                    }
                  >
                    Potvrdit smazání lístku
                  </button>
                </div>
              )}
            </div>
          )}
          {tab === "summaries" && summary && (
            <article>
              <h3>{date(summary.created_at)}</h3>
              <p>{summary.content}</p>
              {summary.decisions.length > 0 && (
                <>
                  <h4>Rozhodnutí</h4>
                  <ul>
                    {summary.decisions.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </>
              )}
              {summary.open_points.length > 0 && (
                <>
                  <h4>Otevřené body</h4>
                  <ul>
                    {summary.open_points.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </>
              )}
              <p>{summary.continuation}</p>
            </article>
          )}
        </div>
      </div>
      {tab !== "summaries" && (
        <form
          className="vm-create"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await mutate(
                tab === "notes"
                  ? {
                      operation: "note_create",
                      title,
                      kind: "list",
                      items: content
                        .split("\n")
                        .map((v) => v.trim())
                        .filter(Boolean),
                      content: null,
                    }
                  : {
                      operation: "memory_remember",
                      kind: "fact",
                      subject: title,
                      content,
                      tags: [],
                    },
              );
              setTitle("");
              setContent("");
            });
          }}
        >
          <h3>{tab === "notes" ? "Nový lístek" : "Nová paměť"}</h3>
          <label>
            {tab === "notes" ? "Název nového lístku" : "Předmět nové paměti"}
            <input
              required
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            {tab === "notes"
              ? "Položky, každá na samostatném řádku"
              : "Nový obsah paměti"}
            <textarea
              required={tab !== "notes"}
              maxLength={2000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
          <button disabled={busy}>
            {tab === "notes" ? "Vytvořit lístek" : "Zapamatovat"}
          </button>
        </form>
      )}
    </section>
  );
}
