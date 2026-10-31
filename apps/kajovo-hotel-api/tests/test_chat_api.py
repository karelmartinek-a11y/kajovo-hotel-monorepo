import http.cookiejar
import json
import sqlite3
import urllib.error
import urllib.request

from tests.test_support import admin_email


def _portal_request(api_base_url: str, email: str, password: str):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    login = urllib.request.Request(
        f"{api_base_url}/api/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(login, timeout=10) as response:
        assert response.status == 200

    def request(path: str, method: str = "GET", payload: dict | None = None):
        data = json.dumps(payload).encode() if payload is not None else None
        headers = {"Content-Type": "application/json"} if data else {}
        if method in {"POST", "PUT", "PATCH", "DELETE"}:
            csrf = next((cookie.value for cookie in jar if cookie.name == "kajovo_csrf"), "")
            headers["x-csrf-token"] = csrf
        req = urllib.request.Request(f"{api_base_url}{path}", data=data, headers=headers, method=method)
        try:
            with opener.open(req, timeout=10) as response:
                raw = response.read().decode()
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode()
            return exc.code, json.loads(raw) if raw else None

    return request


def test_chat_exchange_idempotency_unread_read_and_nonmember_denial(api_request, api_base_url, api_db_path):
    admin_directory_status, admin_directory = api_request("/api/v1/chat/directory")
    assert admin_directory_status == 200
    employee = next(person for person in admin_directory if person["email"] == "sklad@example.com")
    status, conversation = api_request("/api/v1/chat/conversations", "POST", {"recipient_id": employee["id"]})
    assert status == 201
    message_body = {"recipient_id": employee["id"], "body": "Ahoj z administrace", "client_message_id": "chat-test-once-001"}
    status, first = api_request("/api/v1/chat/messages", "POST", message_body)
    assert status == 201
    with sqlite3.connect(api_db_path) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM chat_fcm_outbox WHERE message_id = ?", (first["id"],)
        ).fetchone()[0] == 0
    status, repeated = api_request("/api/v1/chat/messages", "POST", message_body)
    assert status == 201
    assert repeated["id"] == first["id"]
    status, _ = api_request("/api/v1/chat/messages", "POST", {**message_body, "body": "jiný obsah"})
    assert status == 409

    employee_request = _portal_request(api_base_url, "sklad@example.com", "sklad-pass")
    status, employee_directory = employee_request("/api/v1/chat/directory")
    assert status == 200
    assert sum(person["email"] == admin_email().lower() for person in employee_directory) == 1
    admin = next(person for person in employee_directory if person["email"] == admin_email().lower())
    status, employee_conversation = employee_request("/api/v1/chat/conversations", "POST", {"recipient_id": admin["id"]})
    assert status == 201
    assert employee_conversation["id"] == conversation["id"]
    status, incoming = employee_request("/api/v1/chat/messages", "POST", {
        "recipient_id": admin["id"], "body": "Ahoj zpět", "client_message_id": "chat-test-reply-001",
    })
    assert status == 201

    status, admin_conversations = api_request("/api/v1/chat/conversations")
    assert status == 200
    assert next(item for item in admin_conversations if item["id"] == conversation["id"])["unread_count"] == 1
    status, history = api_request(f"/api/v1/chat/conversations/{conversation['id']}/messages")
    assert status == 200
    assert [message["body"] for message in history] == ["Ahoj z administrace", "Ahoj zpět"]
    status, _ = api_request(f"/api/v1/chat/conversations/{conversation['id']}/read", "POST", {"through_message_id": incoming["id"]})
    assert status == 204
    status, history_after_read = employee_request(f"/api/v1/chat/conversations/{conversation['id']}/messages")
    assert status == 200
    assert history_after_read[-1]["read_at"] is not None

    intruder = _portal_request(api_base_url, "pokojska@example.com", "pokojska-pass")
    status, _ = intruder(f"/api/v1/chat/conversations/{conversation['id']}/messages")
    assert status == 403


def test_chat_write_requires_csrf_and_push_requires_configuration(api_request):
    status, _ = api_request("/api/v1/chat/directory")
    assert status == 200
    unauthored = urllib.request.Request(
        f"{api_request.api_base_url}/api/v1/chat/conversations",
        data=b'{"recipient_id":1}',
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    # Reuse the authenticated admin cookie jar, but omit its CSRF header.
    try:
        api_request.opener.open(unauthored, timeout=10)
        assert False, "CSRF-protected chat mutation accepted a request without a token"
    except urllib.error.HTTPError as exc:
        assert exc.code == 403
    status, config = api_request("/api/v1/chat/push/config")
    assert status == 200
    assert config["enabled"] is False
    status, _ = api_request("/api/v1/chat/push/subscriptions", "POST", {
        "endpoint": "http://127.0.0.1/internal",
        "keys": {"p256dh": "not-a-key", "auth": "not-a-key"},
    })
    assert status == 422
    status, _ = api_request("/api/v1/chat/fcm-tokens", "POST", {"token": "fcm-device-token-that-is-long-enough"})
    assert status == 403


def test_employee_can_register_and_remove_native_push_token(api_base_url):
    employee_request = _portal_request(api_base_url, "sklad@example.com", "sklad-pass")
    token = "fcm-test-device-registration-token-0001"
    status, _ = employee_request("/api/v1/chat/fcm-tokens", "POST", {"token": token})
    assert status == 204
    status, _ = employee_request("/api/v1/chat/fcm-tokens", "DELETE", {"token": token})
    assert status == 204
    status, _ = employee_request("/api/v1/chat/fcm-tokens", "POST", {"token": "short"})
    assert status == 422


def test_deleted_recipient_is_hidden_but_history_remains_readable(api_request):
    email = f"chat-history-{id(api_request)}@example.com"
    status, user = api_request("/api/v1/users", "POST", {
        "email": email, "password": "Chat-history-pass", "first_name": "Historie", "last_name": "Chatu", "roles": ["sklad"],
    })
    assert status == 201
    try:
        status, directory = api_request("/api/v1/chat/directory")
        assert status == 200
        recipient = next(person for person in directory if person["email"] == email)
        status, conversation = api_request("/api/v1/chat/conversations", "POST", {"recipient_id": recipient["id"]})
        assert status == 201
        status, sent = api_request("/api/v1/chat/messages", "POST", {
            "recipient_id": recipient["id"], "body": "Zpráva v zachované historii", "client_message_id": "chat-history-once",
        })
        assert status == 201
        status, _ = api_request(f"/api/v1/users/{user['id']}", "DELETE")
        assert status == 204
        status, directory_after_delete = api_request("/api/v1/chat/directory")
        assert status == 200
        assert all(person["email"] != email for person in directory_after_delete)
        status, conversations = api_request("/api/v1/chat/conversations")
        old_chat = next(item for item in conversations if item["id"] == conversation["id"])
        assert status == 200
        assert old_chat["participant"]["is_active"] is False
        status, history = api_request(f"/api/v1/chat/conversations/{conversation['id']}/messages")
        assert status == 200
        assert history[0]["id"] == sent["id"]
        status, _ = api_request("/api/v1/chat/messages", "POST", {
            "recipient_id": recipient["id"], "body": "Další zpráva", "client_message_id": "chat-history-after-delete",
        })
        assert status == 404
    finally:
        api_request(f"/api/v1/users/{user['id']}", "DELETE")


def test_message_result_is_sender_bound_and_does_not_mutate_chat(api_request, api_base_url, api_db_path):
    from uuid import uuid4

    _, directory = api_request('/api/v1/chat/directory')
    recipient = next(person for person in directory if person['email'] == 'sklad@example.com')
    ident = str(uuid4())
    status, sent = api_request('/api/v1/chat/messages', 'POST', {
        'recipient_id': recipient['id'], 'body': 'Synthetic read-only result', 'client_message_id': ident,
    })
    assert status == 201

    def counts():
        with sqlite3.connect(api_db_path) as connection:
            return [connection.execute('SELECT COUNT(*) FROM '+table).fetchone()[0] for table in (
                'chat_participants', 'chat_conversations', 'chat_messages', 'chat_push_outbox', 'chat_fcm_outbox',
            )]

    before = counts()
    status, result = api_request('/api/v1/chat/messages/result', params={'client_message_id': ident})
    assert status == 200 and result == {'state': 'confirmed', 'message': sent}
    assert result['message']['read_at'] is None
    status, unknown = api_request('/api/v1/chat/messages/result', params={'client_message_id': str(uuid4())})
    assert status == 200 and unknown == {'state': 'not_found', 'message': None}
    assert counts() == before
    recipient_request = _portal_request(api_base_url, 'sklad@example.com', 'sklad-pass')
    status, denied = recipient_request('/api/v1/chat/messages/result?client_message_id='+ident)
    assert status == 200 and denied == {'state': 'not_found', 'message': None}
    assert counts() == before
    with sqlite3.connect(api_db_path) as connection:
        assert connection.execute('SELECT read_at FROM chat_messages WHERE id=?', (sent['id'],)).fetchone()[0] is None
    for invalid in ['', 'x'*65]:
        assert api_request('/api/v1/chat/messages/result', params={'client_message_id': invalid})[0] == 422


def test_unknown_message_result_does_not_register_a_new_chat_participant(api_request, api_base_url, api_db_path):
    from uuid import uuid4

    email = 'isolated-chat-result-'+uuid4().hex+'@example.invalid'
    password = 'Synthetic-receipt-login-only'
    status, user = api_request('/api/v1/users', 'POST', {
        'email': email, 'password': password, 'first_name': 'Synthetic', 'last_name': 'Result', 'roles': ['sklad'],
    })
    assert status == 201
    try:
        request = _portal_request(api_base_url, email, password)
        with sqlite3.connect(api_db_path) as connection:
            assert connection.execute("SELECT COUNT(*) FROM chat_participants WHERE principal_type='portal' AND principal_id=?", (user['id'],)).fetchone()[0] == 0
        status, result = request('/api/v1/chat/messages/result?client_message_id='+str(uuid4()))
        assert status == 200 and result == {'state': 'not_found', 'message': None}
        with sqlite3.connect(api_db_path) as connection:
            assert connection.execute("SELECT COUNT(*) FROM chat_participants WHERE principal_type='portal' AND principal_id=?", (user['id'],)).fetchone()[0] == 0
    finally:
        api_request(f"/api/v1/users/{user['id']}", 'DELETE')


def test_incremental_chat_cursor_is_chronological_and_keeps_existing_before_paging(api_request):
    from uuid import uuid4

    _, directory = api_request('/api/v1/chat/directory')
    recipient = next(person for person in directory if person['email'] == 'sklad@example.com')
    sent = []
    for index in range(3):
        status, message = api_request('/api/v1/chat/messages', 'POST', {
            'recipient_id': recipient['id'], 'body': f'Synthetic incremental {index}',
            'client_message_id': str(uuid4()),
        })
        assert status == 201
        sent.append(message)
    path = f"/api/v1/chat/conversations/{sent[0]['conversation_id']}/messages"
    status, newer = api_request(path, params={'after_id': str(sent[0]['id']), 'limit': '1'})
    assert status == 200 and [message['id'] for message in newer] == [sent[1]['id']]
    status, between = api_request(path, params={
        'after_id': str(sent[0]['id']), 'before_id': str(sent[2]['id']), 'limit': '100',
    })
    assert status == 200 and [message['id'] for message in between] == [sent[1]['id']]
    status, older = api_request(path, params={'before_id': str(sent[2]['id']), 'limit': '1'})
    assert status == 200 and [message['id'] for message in older] == [sent[1]['id']]
    assert api_request(path, params={'after_id': '0', 'limit': '1'})[0] == 200
    assert api_request(path, params={'after_id': '-1'})[0] == 422


def test_push_subscription_status_is_read_only_and_bound_to_current_participant(api_request, api_base_url, api_db_path):
    import base64
    import hashlib
    from uuid import uuid4

    endpoint = 'https://fcm.googleapis.com/fcm/send/isolated-'+uuid4().hex
    key = base64.urlsafe_b64encode(b'synthetic-push-key-only').decode().rstrip('=')
    digest = hashlib.sha256(json.dumps({'endpoint': endpoint, 'keys': {'auth': key, 'p256dh': key}}, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    path = '/api/v1/chat/push/subscriptions/status'
    _, config = api_request('/api/v1/chat/push/config')
    assert config['participant_id'] > 0
    status, original = api_request(path, params={'subscription_hash': digest})
    assert status == 200 and original == {'subscribed': False, 'participant_id': config['participant_id']}
    key = base64.urlsafe_b64encode(b'synthetic-push-key-only').decode().rstrip('=')
    assert api_request('/api/v1/chat/push/subscriptions', 'POST', {
        'endpoint': endpoint, 'keys': {'p256dh': key, 'auth': key},
    })[0] == 204
    try:
        with sqlite3.connect(api_db_path) as connection:
            before = connection.execute('SELECT COUNT(*),MAX(updated_at) FROM chat_push_subscriptions').fetchone()
        status, actual = api_request(path, params={'subscription_hash': digest})
        assert status == 200 and actual == {'subscribed': True, 'participant_id': config['participant_id']}
        other = _portal_request(api_base_url, 'sklad@example.com', 'sklad-pass')
        status, denied = other(path+'?subscription_hash='+digest)
        assert status == 200 and denied['subscribed'] is False
        with sqlite3.connect(api_db_path) as connection:
            assert connection.execute('SELECT COUNT(*),MAX(updated_at) FROM chat_push_subscriptions').fetchone() == before
        assert api_request(path, params={'subscription_hash': 'invalid'})[0] == 422
    finally:
        assert api_request('/api/v1/chat/push/subscriptions', 'DELETE', {'endpoint': endpoint})[0] == 204
    assert api_request(path, params={'subscription_hash': digest})[1]['subscribed'] is False
