import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiClient, t, type ChatConversationRead, type ChatMessageRead, type ChatParticipantRead } from '@kajovo/shared';
import { Icon } from '../components/Icon';
import './chat.css';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : t('Chat se nepodařilo načíst.');
}

function decodeKey(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)).buffer as ArrayBuffer;
}

export async function unregisterChatPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      try { await apiClient.chatDeletePush({ endpoint: subscription.endpoint }); } catch { /* Local unsubscribe still invalidates delivery to this browser. */ }
      await subscription.unsubscribe();
    }
  } catch {
    // Push registration can be removed on the next account login if the network is offline.
  }
}

export function ChatUnreadLink(): JSX.Element {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    const refresh = async (): Promise<void> => {
      if (document.visibilityState !== 'visible') return;
      try {
        const result = await apiClient.chatUnreadCount();
        if (active) setCount(Number(result.unread_count ?? 0));
      } catch { /* Keep the last known badge while reconnecting. */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return <Link className="k-bottom-nav__link" to="/chat" aria-current={window.location.pathname.includes('/chat') ? 'page' : undefined}>
    <span className="k-bottom-nav__icon"><Icon name="message-circle" /></span><span>{t('Chat')}</span>
    {count > 0 ? <span className="k-bottom-nav__badge" aria-label={`${count} ${t('nepřečtených')}`}>{count > 99 ? '99+' : count}</span> : null}
  </Link>;
}

type Props = { surface?: 'portal' | 'admin' };
export function ChatPage({ surface = 'portal' }: Props): JSX.Element {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const selectedId = conversationId ? Number(conversationId) : null;
  const [conversations, setConversations] = React.useState<ChatConversationRead[]>([]);
  const [directory, setDirectory] = React.useState<ChatParticipantRead[]>([]);
  const [messages, setMessages] = React.useState<ChatMessageRead[]>([]);
  const [hasOlder, setHasOlder] = React.useState(false);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [body, setBody] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = React.useState(false);
  const [pushConfigured, setPushConfigured] = React.useState(false);
  const [pushSupported] = React.useState(() => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
  const listRef = React.useRef<HTMLDivElement>(null);
  const pendingSendRef = React.useRef<{ body: string; id: string } | null>(null);
  const selected = conversations.find((item) => item.id === selectedId);

  const refreshList = React.useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const [items, people] = await Promise.all([apiClient.chatConversations(), apiClient.chatDirectory()]);
      setConversations(items); setDirectory(people); setError(null);
    } catch (cause) { setError(errorText(cause)); }
  }, []);

  const refreshMessages = React.useCallback(async (forceScroll = false) => {
    if (!selectedId || document.visibilityState !== 'visible') { setMessages([]); return; }
    const currentList = listRef.current;
    const wasAtBottom = forceScroll || !currentList || currentList.scrollHeight - currentList.scrollTop - currentList.clientHeight < 80;
    try {
      const rows = await apiClient.chatMessages(selectedId, { limit: 50 });
      setMessages(rows);
      setHasOlder(rows.length === 50);
      const incoming = rows.filter((message) => !message.is_mine);
      const lastIncoming = incoming[incoming.length - 1];
      if (lastIncoming && wasAtBottom) {
        await apiClient.chatMarkRead(selectedId, { through_message_id: lastIncoming.id });
        void refreshList();
      }
      if (wasAtBottom) requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; });
    } catch (cause) { setError(errorText(cause)); }
  }, [selectedId, selected?.participant.id, refreshList]);

  React.useEffect(() => {
    void refreshList();
    const timer = window.setInterval(() => void refreshList(), 10_000);
    document.addEventListener('visibilitychange', refreshList);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshList); };
  }, [refreshList]);
  React.useEffect(() => {
    void refreshMessages();
    const timer = window.setInterval(() => void refreshMessages(), 3_000);
    const onVisibilityChange = (): void => { void refreshMessages(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibilityChange); };
  }, [refreshMessages]);

  React.useEffect(() => {
    if (!pushSupported) return;
    void navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).then(async (registration) => {
      const config = await apiClient.chatPushConfig();
      setPushConfigured(Boolean(config.enabled));
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) { setPushEnabled(false); return; }
      await apiClient.chatRegisterPush(subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null });
      setPushEnabled(true);
    }).catch(() => setPushEnabled(false));
  }, [pushSupported]);

  const openPerson = async (person: ChatParticipantRead): Promise<void> => {
    try {
      const chat = await apiClient.chatCreateConversation({ recipient_id: person.id });
      await refreshList(); navigate(`/chat/${chat.id}`);
    } catch (cause) { setError(errorText(cause)); }
  };
  const send = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!body.trim() || !selected || !selected.participant.is_active || busy) return;
    setBusy(true); setError(null);
    try {
      const trimmedBody = body.trim();
      if (!pendingSendRef.current || pendingSendRef.current.body !== trimmedBody) {
        pendingSendRef.current = { body: trimmedBody, id: crypto.randomUUID() };
      }
      await apiClient.chatSendMessage({ recipient_id: selected.participant.id, body: trimmedBody, client_message_id: pendingSendRef.current.id });
      pendingSendRef.current = null;
      setBody(''); await Promise.all([refreshMessages(true), refreshList()]);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };
  const loadOlder = async (): Promise<void> => {
    const first = messages[0];
    if (!selectedId || !first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await apiClient.chatMessages(selectedId, { before_id: first.id, limit: 50 });
      setMessages((current) => [...older, ...current]);
      setHasOlder(older.length === 50);
    } catch (cause) { setError(errorText(cause)); }
    finally { setLoadingOlder(false); }
  };
  const enablePush = async (): Promise<void> => {
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      const config = await apiClient.chatPushConfig();
      if (!config.enabled || typeof config.public_key !== 'string') throw new Error(t('Upozornění zatím nejsou na serveru nakonfigurována.'));
      const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(config.public_key) });
      await apiClient.chatRegisterPush(subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null });
      setPushEnabled(true);
    } catch (cause) { setError(errorText(cause)); }
  };

  return <main className={`k-page k-chat-page ${selectedId ? 'has-conversation' : ''}`} data-testid="chat-page" data-chat-surface={surface}>
    <div className="k-chat-heading"><div><h1>{t('Interní chat')}</h1><p>{t('Soukromé zprávy mezi zaměstnanci a administrací.')}</p></div>
      {pushSupported && pushConfigured && !pushEnabled ? <button className="k-button secondary" onClick={() => void enablePush()} type="button">{t('Zapnout oznámení')}</button> : null}
      {pushSupported && !pushConfigured ? <span className="k-chat-push-note">{t('Oznámení nejsou na serveru nakonfigurována.')}</span> : null}</div>
    {error ? <p role="alert" className="k-chat-error">{error}</p> : null}
    <section className="k-chat-layout" aria-label={t('Interní chat')}>
      <aside className={`k-chat-sidebar ${selectedId ? 'is-hidden-mobile' : ''}`}>
        <h2>{t('Konverzace')}</h2>
        {conversations.map((item) => <Link key={item.id} className="k-chat-person" to={`/chat/${item.id}`} aria-current={item.id === selectedId ? 'page' : undefined}>
          <span className="k-chat-person__avatar">{item.participant.display_name.slice(0, 1).toLocaleUpperCase()}</span><span className="k-chat-person__content"><strong>{item.participant.display_name}</strong><span>{item.last_message?.body ?? t('Nová konverzace')}</span></span>
          {item.unread_count > 0 ? <span className="k-chat-unread">{item.unread_count}</span> : null}
        </Link>)}
        <h2>{t('Začít konverzaci')}</h2>
        {directory.map((person) => <button key={person.id} className="k-chat-person" type="button" onClick={() => void openPerson(person)}><span className="k-chat-person__avatar">{person.display_name.slice(0, 1).toLocaleUpperCase()}</span><span className="k-chat-person__content"><strong>{person.display_name}</strong><span>{person.email}</span></span></button>)}
      </aside>
      <section className={`k-chat-conversation ${!selectedId ? 'is-empty-mobile' : ''}`} aria-label={selected?.participant.display_name ?? t('Konverzace')}>
        {selected ? <><header className="k-chat-conversation__header"><Link to="/chat" className="k-chat-back">‹ {t('Zpět')}</Link><span className="k-chat-person__avatar">{selected.participant.display_name.slice(0, 1).toLocaleUpperCase()}</span><div><h2>{selected.participant.display_name}</h2><span>{selected.participant.is_active ? t('Aktivní účet') : t('Účet již není aktivní')}</span></div></header>
          <div className="k-chat-messages" ref={listRef} aria-live="polite">{hasOlder ? <button className="k-button secondary k-chat-older" type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? t('Načítám…') : t('Načíst starší zprávy')}</button> : null}{messages.map((message) => { const own = message.is_mine; return <article key={message.id} className={`k-chat-bubble ${own ? 'is-own' : ''}`}>
            <p>{message.body}</p><footer><time dateTime={message.sent_at}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(message.sent_at))}</time>{own ? <span>{message.read_at ? t('Přečteno') : t('Odesláno')}</span> : null}</footer>
          </article>; })}</div>
          {selected.participant.is_active ? (
            <form className="k-chat-compose" onSubmit={(event) => void send(event)}>
              <label className="k-chat-sr-only" htmlFor="chat-message">{t('Napište zprávu')}</label>
              <textarea
                id="chat-message"
                value={body}
                rows={2}
                maxLength={4000}
                placeholder={t('Napište zprávu…')}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button className="k-button" type="submit" disabled={busy || !body.trim()}>{t('Odeslat')}</button>
            </form>
          ) : <p className="k-chat-inactive">{t('Tento účet již není aktivní. Historii můžete dále číst.')}</p>}
        </> : <div className="k-chat-placeholder"><Icon name="message-circle" /><h2>{t('Vyberte konverzaci')}</h2><p>{t('Vyberte člověka ze seznamu nebo začněte novou konverzaci.')}</p></div>}
      </section>
    </section>
  </main>;
}
