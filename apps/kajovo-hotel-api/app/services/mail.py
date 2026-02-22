from dataclasses import dataclass
from typing import Protocol

from app.config import Settings


@dataclass(frozen=True)
class MailMessage:
    recipient: str
    subject: str
    body: str


class MailService(Protocol):
    def send(self, message: MailMessage) -> None: ...


class MockMailService:
    def send(self, message: MailMessage) -> None:
        _ = message


class SmtpMailService:
    def __init__(self, sender: str) -> None:
        self.sender = sender

    def send(self, message: MailMessage) -> None:
        _ = (self.sender, message)


def get_mail_service(settings: Settings) -> MailService:
    if settings.smtp_enabled:
        return SmtpMailService(settings.smtp_from_email)
    return MockMailService()


def send_admin_password_hint(*, settings: Settings, recipient: str) -> None:
    service = get_mail_service(settings)
    service.send(
        MailMessage(
            recipient=recipient,
            subject="KájovoHotel admin password hint",
            body=settings.admin_password_hint,
        )
    )
