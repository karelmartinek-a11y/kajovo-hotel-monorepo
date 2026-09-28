from app.api.routes.chat import _fcm_data_payload


def test_native_chat_notification_payload_has_no_message_content():
    assert _fcm_data_payload(42) == {"type": "chat_message", "conversation_id": "42"}
