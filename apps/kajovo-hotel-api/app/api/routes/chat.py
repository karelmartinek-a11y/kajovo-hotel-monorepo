from __future__ import annotations

import json
import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.schemas import (
    ChatConversationCreate,
    ChatConversationRead,
    ChatMessageCreate,
    ChatMessageRead,
    ChatParticipantRead,
    ChatReadThrough,
    WebPushSubscriptionCreate,
    WebPushSubscriptionDelete,
)
from app.config import get_settings
from app.db.models import (
    AdminProfile,
    ChatConversation,
    ChatMessage,
    ChatParticipant,
    ChatPushOutbox,
    ChatPushSubscription,
    PortalUser,
)
from app.db.session import SessionLocal, get_db
from app.security.auth import require_session
from app.security.rbac import normalize_role
from app.time_utils import utc_now

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


def _portal_name(user: PortalUser) -> str:
    name = " ".join(part.strip() for part in (user.first_name, user.last_name) if part and part.strip())
    return name or user.email


def _is_admin_user(user: PortalUser) -> bool:
    for role in user.roles:
        try:
            if normalize_role(role.role) == "admin":
                return True
        except ValueError:
            continue
    return False


def _portal_user_by_email(db: Session, email: str, *, admin_only: bool = False) -> PortalUser | None:
    users = db.execute(select(PortalUser).where(func.lower(PortalUser.email) == email.strip().lower())).scalars().all()
    return next((user for user in users if not admin_only or _is_admin_user(user)), None)


def _participant(db: Session, kind: str, principal_id: int, email: str, display_name: str, active: bool) -> ChatParticipant:
    row = db.execute(
        select(ChatParticipant).where(
            ChatParticipant.principal_type == kind,
            ChatParticipant.principal_id == principal_id,
        )
    ).scalar_one_or_none()
    if row is None:
        row = ChatParticipant(principal_type=kind, principal_id=principal_id, email=email.strip().lower(), display_name=display_name, is_active=active)
        try:
            with db.begin_nested():
                db.add(row)
                db.flush()
        except IntegrityError:
            row = db.execute(
                select(ChatParticipant).where(
                    ChatParticipant.principal_type == kind,
                    ChatParticipant.principal_id == principal_id,
                )
            ).scalar_one()
            row.email = email.strip().lower()
            row.display_name = display_name
            row.is_active = active
    else:
        row.email = email.strip().lower()
        row.display_name = display_name
        row.is_active = active
        db.add(row)
    return row


def _ensure_directory(db: Session) -> list[ChatParticipant]:
    users = db.execute(select(PortalUser).order_by(PortalUser.first_name, PortalUser.last_name, PortalUser.email)).scalars().all()
    principals = [
        _participant(db, "portal", user.id, user.email, _portal_name(user), user.is_active)
        for user in users
    ]
    admin = db.get(AdminProfile, 1)
    if admin is not None:
        existing_admin = _portal_user_by_email(db, admin.email, admin_only=True)
        if existing_admin is None:
            principals.append(_participant(db, "admin_profile", admin.id, admin.email, admin.display_name or admin.email, True))
    db.flush()
    return principals


def _actor_participant(request: Request, db: Session) -> tuple[dict[str, object], ChatParticipant]:
    session = require_session(request, db)
    user_id = session.get("portal_user_id")
    if user_id is not None:
        user = db.get(PortalUser, int(user_id))
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
        participant = _participant(db, "portal", user.id, user.email, _portal_name(user), True)
        db.commit()
        return session, participant

    email = str(session.get("email") or "").strip().lower()
    user = _portal_user_by_email(db, email, admin_only=True)
    if user is not None and user.is_active:
        participant = _participant(db, "portal", user.id, user.email, _portal_name(user), True)
        db.commit()
        return session, participant

    admin = db.get(AdminProfile, 1)
    if admin is None or admin.email.strip().lower() != email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chat is available to signed-in users only.")
    participant = _participant(db, "admin_profile", admin.id, admin.email, admin.display_name or admin.email, True)
    db.commit()
    return session, participant


def _participant_live(db: Session, participant: ChatParticipant) -> bool:
    if participant.principal_type == "portal_deleted":
        return False
    if participant.principal_type == "portal":
        user = db.get(PortalUser, participant.principal_id)
        return bool(user and user.is_active)
    admin = db.get(AdminProfile, participant.principal_id)
    if admin is None:
        return False
    return _portal_user_by_email(db, admin.email, admin_only=True) is None or participant.principal_type == "admin_profile"


def _participant_read(row: ChatParticipant, *, active: bool | None = None) -> ChatParticipantRead:
    return ChatParticipantRead(id=row.id, display_name=row.display_name, email=row.email, is_active=row.is_active if active is None else active)


def _message_read(row: ChatMessage, actor_id: int | None = None) -> ChatMessageRead:
    return ChatMessageRead(id=row.id, conversation_id=row.conversation_id, sender_id=row.sender_id, is_mine=actor_id is not None and row.sender_id == actor_id, body=row.body, sent_at=row.sent_at, read_at=row.read_at)


def _conversation_for(db: Session, conversation_id: int, actor_id: int) -> tuple[ChatConversation, int]:
    conversation = db.get(ChatConversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Konverzace nebyla nalezena.")
    if actor_id not in {conversation.participant_low_id, conversation.participant_high_id}:
        raise HTTPException(status_code=403, detail="K této konverzaci nemáte přístup.")
    other_id = conversation.participant_high_id if actor_id == conversation.participant_low_id else conversation.participant_low_id
    return conversation, other_id


def _create_or_get_conversation(db: Session, first_id: int, second_id: int) -> ChatConversation:
    low, high = sorted((first_id, second_id))
    row = db.execute(
        select(ChatConversation).where(
            ChatConversation.participant_low_id == low,
            ChatConversation.participant_high_id == high,
        )
    ).scalar_one_or_none()
    if row is not None:
        return row
    row = ChatConversation(participant_low_id=low, participant_high_id=high)
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
    except IntegrityError:
        row = db.execute(
            select(ChatConversation).where(
                ChatConversation.participant_low_id == low,
                ChatConversation.participant_high_id == high,
            )
        ).scalar_one()
    return row


@router.get("/push/config", operation_id="chat_push_config")
def get_push_config(request: Request, db: Session = Depends(get_db)) -> dict[str, object]:
    _actor_participant(request, db)
    settings = get_settings()
    enabled = bool(settings.web_push_vapid_public_key and settings.web_push_vapid_private_key)
    return {"enabled": enabled, "public_key": settings.web_push_vapid_public_key if enabled else None}


@router.get("/directory", response_model=list[ChatParticipantRead], operation_id="chat_directory")
def list_directory(request: Request, db: Session = Depends(get_db)) -> list[ChatParticipantRead]:
    _, actor = _actor_participant(request, db)
    principals = _ensure_directory(db)
    db.commit()
    return [_participant_read(item) for item in principals if item.id != actor.id and item.is_active]


@router.get("/unread-count", operation_id="chat_unread_count")
def unread_count(request: Request, db: Session = Depends(get_db)) -> dict[str, int]:
    _, actor = _actor_participant(request, db)
    conversations = select(ChatConversation.id).where(
        or_(ChatConversation.participant_low_id == actor.id, ChatConversation.participant_high_id == actor.id)
    )
    count = db.scalar(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.conversation_id.in_(conversations),
            ChatMessage.sender_id != actor.id,
            ChatMessage.read_at.is_(None),
        )
    ) or 0
    return {"unread_count": int(count)}


@router.get("/conversations", response_model=list[ChatConversationRead], operation_id="chat_conversations")
def list_conversations(request: Request, db: Session = Depends(get_db)) -> list[ChatConversationRead]:
    _, actor = _actor_participant(request, db)
    rows = db.execute(
        select(ChatConversation)
        .where(or_(ChatConversation.participant_low_id == actor.id, ChatConversation.participant_high_id == actor.id))
        .order_by(ChatConversation.updated_at.desc(), ChatConversation.id.desc())
    ).scalars().all()
    result: list[ChatConversationRead] = []
    for conversation in rows:
        other_id = conversation.participant_high_id if actor.id == conversation.participant_low_id else conversation.participant_low_id
        other = db.get(ChatParticipant, other_id)
        if other is None:
            continue
        active = _participant_live(db, other)
        other.is_active = active
        latest = db.execute(
            select(ChatMessage).where(ChatMessage.conversation_id == conversation.id).order_by(ChatMessage.id.desc()).limit(1)
        ).scalar_one_or_none()
        unread = db.scalar(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.conversation_id == conversation.id,
                ChatMessage.sender_id != actor.id,
                ChatMessage.read_at.is_(None),
            )
        ) or 0
        result.append(ChatConversationRead(id=conversation.id, participant=_participant_read(other, active=active), last_message=_message_read(latest, actor.id) if latest else None, unread_count=int(unread)))
    db.commit()
    return result


@router.post("/conversations", response_model=ChatConversationRead, status_code=status.HTTP_201_CREATED, operation_id="chat_create_conversation")
def create_conversation(payload: ChatConversationCreate, request: Request, db: Session = Depends(get_db)) -> ChatConversationRead:
    _, actor = _actor_participant(request, db)
    recipient = db.get(ChatParticipant, payload.recipient_id)
    if recipient is None or not _participant_live(db, recipient):
        raise HTTPException(status_code=404, detail="Příjemce není dostupný.")
    if recipient.id == actor.id:
        raise HTTPException(status_code=400, detail="Nelze založit konverzaci se sebou samým.")
    conversation = _create_or_get_conversation(db, actor.id, recipient.id)
    db.commit()
    other = db.get(ChatParticipant, recipient.id)
    return ChatConversationRead(id=conversation.id, participant=_participant_read(other, active=True), unread_count=0)


@router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessageRead], operation_id="chat_messages")
def list_messages(
    conversation_id: int,
    request: Request,
    before_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[ChatMessageRead]:
    _, actor = _actor_participant(request, db)
    _conversation_for(db, conversation_id, actor.id)
    stmt = select(ChatMessage).where(ChatMessage.conversation_id == conversation_id)
    if before_id is not None:
        stmt = stmt.where(ChatMessage.id < before_id)
    rows = db.execute(stmt.order_by(ChatMessage.id.desc()).limit(limit)).scalars().all()
    return [_message_read(row, actor.id) for row in reversed(rows)]


@router.post("/messages", response_model=ChatMessageRead, status_code=status.HTTP_201_CREATED, operation_id="chat_send_message")
def send_message(payload: ChatMessageCreate, request: Request, db: Session = Depends(get_db)) -> ChatMessageRead:
    _, actor = _actor_participant(request, db)
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=422, detail="Zpráva nesmí být prázdná.")
    previous = db.execute(
        select(ChatMessage).where(
            ChatMessage.sender_id == actor.id,
            ChatMessage.client_message_id == payload.client_message_id,
        )
    ).scalar_one_or_none()
    if previous is not None:
        conversation, other_id = _conversation_for(db, previous.conversation_id, actor.id)
        if other_id != payload.recipient_id:
            raise HTTPException(status_code=409, detail="Identifikátor odeslání už patří jiné zprávě.")
        if previous.body != body:
            raise HTTPException(status_code=409, detail="Identifikátor odeslání už patří jinému obsahu.")
        return _message_read(previous, actor.id)
    recipient = db.get(ChatParticipant, payload.recipient_id)
    if recipient is None or not _participant_live(db, recipient):
        raise HTTPException(status_code=404, detail="Příjemce není dostupný.")
    if recipient.id == actor.id:
        raise HTTPException(status_code=400, detail="Zprávu nelze poslat sobě.")
    conversation = _create_or_get_conversation(db, actor.id, recipient.id)
    message = ChatMessage(conversation_id=conversation.id, sender_id=actor.id, body=body, client_message_id=payload.client_message_id)
    try:
        with db.begin_nested():
            db.add(message)
            db.flush()
    except IntegrityError:
        previous = db.execute(
            select(ChatMessage).where(
                ChatMessage.sender_id == actor.id,
                ChatMessage.client_message_id == payload.client_message_id,
            )
        ).scalar_one_or_none()
        if previous is None:
            raise
        _, other_id = _conversation_for(db, previous.conversation_id, actor.id)
        if other_id != recipient.id or previous.body != body:
            raise HTTPException(status_code=409, detail="Identifikátor odeslání už patří jiné zprávě.")
        return _message_read(previous, actor.id)
    conversation.updated_at = utc_now()
    db.add(ChatPushOutbox(message_id=message.id, next_attempt_at=utc_now()))
    db.commit()
    db.refresh(message)
    return _message_read(message, actor.id)


@router.post("/conversations/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT, operation_id="chat_mark_read")
def mark_read(conversation_id: int, payload: ChatReadThrough, request: Request, db: Session = Depends(get_db)) -> None:
    _, actor = _actor_participant(request, db)
    _conversation_for(db, conversation_id, actor.id)
    through = db.get(ChatMessage, payload.through_message_id)
    if through is None or through.conversation_id != conversation_id:
        raise HTTPException(status_code=404, detail="Zpráva nebyla nalezena.")
    now = utc_now()
    db.query(ChatMessage).filter(
        ChatMessage.conversation_id == conversation_id,
        ChatMessage.sender_id != actor.id,
        ChatMessage.id <= through.id,
        ChatMessage.read_at.is_(None),
    ).update({ChatMessage.read_at: now}, synchronize_session=False)
    db.commit()


@router.post("/push/subscriptions", status_code=status.HTTP_204_NO_CONTENT, operation_id="chat_register_push")
def register_push_subscription(payload: WebPushSubscriptionCreate, request: Request, db: Session = Depends(get_db)) -> None:
    _, actor = _actor_participant(request, db)
    row = db.execute(select(ChatPushSubscription).where(ChatPushSubscription.endpoint == payload.endpoint)).scalar_one_or_none()
    if row is None:
        row = ChatPushSubscription(participant_id=actor.id, endpoint=payload.endpoint, p256dh=payload.keys.p256dh, auth=payload.keys.auth)
    else:
        row.participant_id = actor.id
        row.p256dh = payload.keys.p256dh
        row.auth = payload.keys.auth
    db.add(row)
    db.commit()


@router.delete("/push/subscriptions", status_code=status.HTTP_204_NO_CONTENT, operation_id="chat_delete_push")
def unregister_push_subscription(payload: WebPushSubscriptionDelete, request: Request, db: Session = Depends(get_db)) -> None:
    _, actor = _actor_participant(request, db)
    db.query(ChatPushSubscription).filter(
        ChatPushSubscription.participant_id == actor.id,
        ChatPushSubscription.endpoint == payload.endpoint,
    ).delete(synchronize_session=False)
    db.commit()


def _notification_url(db: Session, participant: ChatParticipant, conversation_id: int) -> str:
    if participant.principal_type == "admin_profile":
        prefix = "/admin"
    else:
        user = db.get(PortalUser, participant.principal_id)
        prefix = "/admin" if user is not None and _is_admin_user(user) else ""
    return f"{prefix}/chat/{conversation_id}"


def dispatch_pending_chat_pushes() -> None:
    settings = get_settings()
    with SessionLocal() as db:
        rows = db.execute(
            select(ChatPushOutbox).where(
                ChatPushOutbox.sent_at.is_(None),
                ChatPushOutbox.next_attempt_at <= utc_now(),
            ).order_by(ChatPushOutbox.id).limit(20).with_for_update(skip_locked=True)
        ).scalars().all()
        if not rows:
            return
        if not settings.web_push_vapid_public_key or not settings.web_push_vapid_private_key:
            for row in rows:
                row.attempts += 1
                row.next_attempt_at = utc_now() + timedelta(minutes=5)
                row.last_error = "PushNotConfigured"
            db.commit()
            return
        from pywebpush import WebPushException, webpush

        for row in rows:
            message = db.get(ChatMessage, row.message_id)
            conversation = db.get(ChatConversation, message.conversation_id) if message else None
            if message is None or conversation is None:
                row.sent_at = utc_now()
                continue
            recipient_id = conversation.participant_high_id if message.sender_id == conversation.participant_low_id else conversation.participant_low_id
            recipient = db.get(ChatParticipant, recipient_id)
            subscriptions = db.execute(select(ChatPushSubscription).where(ChatPushSubscription.participant_id == recipient_id)).scalars().all()
            failed = False
            for sub in subscriptions:
                try:
                    webpush(
                        subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                        data=json.dumps({"title": db.get(ChatParticipant, message.sender_id).display_name, "body": message.body[:160], "url": _notification_url(db, recipient, conversation.id) if recipient else f"/chat/{conversation.id}"}),
                        vapid_private_key=settings.web_push_vapid_private_key,
                        vapid_claims={"sub": settings.web_push_vapid_subject},
                        ttl=60 * 60 * 24,
                    )
                except WebPushException as exc:
                    response = getattr(exc, "response", None)
                    code = getattr(response, "status_code", None)
                    if code in {404, 410}:
                        db.delete(sub)
                    else:
                        failed = True
                except Exception as exc:
                    failed = True
                    row.last_error = type(exc).__name__
            if failed:
                row.attempts += 1
                row.next_attempt_at = utc_now() + timedelta(seconds=min(30 * (2 ** min(row.attempts, 7)), 3600))
                row.last_error = row.last_error or "WebPushDeliveryFailed"
            else:
                row.sent_at = utc_now()
                row.last_error = None
        db.commit()
