from types import SimpleNamespace

from app.api.routes.chat import _fcm_data_payload, _undelivered_fcm_tokens


def test_native_chat_notification_payload_has_no_message_content():
    assert _fcm_data_payload(42) == {"type": "chat_message", "conversation_id": "42"}


def test_fcm_retry_skips_tokens_already_confirmed_delivered():
    tokens = [SimpleNamespace(id=1), SimpleNamespace(id=2)]
    assert [row.id for row in _undelivered_fcm_tokens(tokens, {1})] == [2]
