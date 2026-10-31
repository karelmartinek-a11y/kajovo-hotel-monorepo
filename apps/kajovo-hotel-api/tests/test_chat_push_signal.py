"""No private chat content leaves the service through the push provider."""
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pywebpush
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.api.routes import chat
from app.db.models import Base, ChatConversation, ChatMessage, ChatParticipant, ChatPushOutbox, ChatPushSubscription


def test_only_cml_subscriptions_receive_content_free_signals(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'push.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    calls = []
    monkeypatch.setattr(chat, 'SessionLocal', factory)
    monkeypatch.setattr(chat, 'get_settings', lambda: SimpleNamespace(web_push_vapid_public_key='synthetic', web_push_vapid_private_key='synthetic', web_push_vapid_subject='mailto:synthetic@example.invalid'))
    monkeypatch.setattr(pywebpush, 'webpush', lambda **kwargs: calls.append(kwargs))
    try:
        with factory() as db:
            sender = ChatParticipant(principal_type='portal', principal_id=101, email='sender@example.invalid', display_name='PRIVATE_SENDER_NAME')
            recipient = ChatParticipant(principal_type='portal', principal_id=102, email='recipient@example.invalid', display_name='PRIVATE_RECIPIENT_NAME')
            db.add_all([sender, recipient])
            db.flush()
            conversation = ChatConversation(participant_low_id=sender.id, participant_high_id=recipient.id)
            db.add(conversation)
            db.flush()
            message = ChatMessage(conversation_id=conversation.id, sender_id=sender.id, body='PRIVATE_CHAT_CONTENT_NOT_FOR_PROVIDER', client_message_id='synthetic-push-message')
            db.add(message)
            db.flush()
            db.add(ChatPushOutbox(message_id=message.id, next_attempt_at=datetime.now(timezone.utc)-timedelta(seconds=1)))
            for label, authorized in [('legacy', False), ('cml', True)]:
                db.add(ChatPushSubscription(participant_id=recipient.id, endpoint='https://fcm.googleapis.com/fcm/send/synthetic-'+label, p256dh='synthetic-key', auth='synthetic-auth', cml_authorized=authorized))
            db.commit()
            expected = {'contract':'kajovo-hotel-chat-signal/1','conversation_id':conversation.id,'message_id':message.id,'recipient_id':recipient.id}
        chat.dispatch_pending_chat_pushes()
        assert len(calls) == 1
        assert calls[0]['subscription_info']['endpoint'].endswith('synthetic-cml')
        assert json.loads(calls[0]['data']) == expected
        serialized = json.dumps(calls)
        assert 'PRIVATE_CHAT_CONTENT' not in serialized and 'PRIVATE_SENDER_NAME' not in serialized and 'recipient@example.invalid' not in serialized
        with factory() as db:
            assert len(db.scalars(select(ChatPushSubscription)).all()) == 2
            assert db.scalar(select(ChatMessage.body)) == 'PRIVATE_CHAT_CONTENT_NOT_FOR_PROVIDER'
            assert db.scalar(select(ChatPushOutbox.sent_at)) is not None
    finally:
        engine.dispose()
