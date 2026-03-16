from __future__ import annotations

import base64
import hashlib
import hmac
import json
from pathlib import Path
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol

from app.config import Settings


@dataclass(frozen=True)
class MailMessage:
    recipient: str
    subject: str
    body: str


@dataclass(frozen=True)
class SmtpSettingsPayload:
    host: str
    port: int
    username: str
    password: str
    use_tls: bool
    use_ssl: bool


@dataclass(frozen=True)
class StoredSmtpConfig:
    host: str
    port: int
    username: str
    use_tls: bool
    use_ssl: bool
    password_encrypted: str


@dataclass(frozen=True)
class SmtpConfigRead:
    host: str
    port: int
    username: str
    use_tls: bool
    use_ssl: bool
    password_masked: str


@dataclass(frozen=True)
class MailDeliveryResult:
    connected: bool
    send_attempted: bool


class EmailService(Protocol):
    def send(self, message: MailMessage) -> MailDeliveryResult: ...


class SmtpNotConfiguredError(RuntimeError):
    pass


class SmtpDeliveryError(RuntimeError):
    def __init__(self, message: str, *, connected: bool, send_attempted: bool) -> None:
        super().__init__(message)
        self.connected = connected
        self.send_attempted = send_attempted


def validate_smtp_security_mode(*, port: int, use_tls: bool, use_ssl: bool) -> None:
    if use_tls and use_ssl:
        raise ValueError("SMTP nemuze soucasne pouzivat TLS i SSL. Zvolte pouze jeden rezim.")

    if port == 465 and use_tls and not use_ssl:
        raise ValueError("Port 465 obvykle vyzaduje SSL. Vypnete TLS a zapnete SSL.")

    if port == 587 and use_ssl and not use_tls:
        raise ValueError("Port 587 obvykle pouziva TLS/STARTTLS. Vypnete SSL a zapnete TLS.")


def describe_smtp_transport_error(message: str, *, port: int, use_tls: bool, use_ssl: bool) -> str:
    upper_message = message.upper()
    if "WRONG_VERSION_NUMBER" in upper_message:
        if use_ssl:
            return "SMTP server odmitl implicitni SSL handshake. Pro port 587 vypnete SSL a zapnete TLS."
        if use_tls:
            return "SMTP server odmitl TLS/STARTTLS handshake. Pro port 465 vypnete TLS a zapnete SSL."
        return "SMTP server odmitl vyjednani sifrovani. Zkontrolujte, zda port pouziva TLS nebo SSL."
    return message


class MockSmtpTransport:
    def __init__(self) -> None:
        self.sent_messages: list[MailMessage] = []

    def send(
        self,
        *,
        sender: str,
        message: MailMessage,
        smtp: StoredSmtpConfig,
    ) -> MailDeliveryResult:
        _ = sender
        _ = smtp
        self.sent_messages.append(message)
        return MailDeliveryResult(connected=True, send_attempted=True)


def _derive_key(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encrypt_secret(plaintext: str, key_secret: str) -> str:
    data = plaintext.encode("utf-8")
    key = _derive_key(key_secret)
    cipher = bytes(byte ^ key[index % len(key)] for index, byte in enumerate(data))
    signature = hmac.new(key, cipher, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(cipher + signature).decode("utf-8")


def decrypt_secret(ciphertext: str, key_secret: str) -> str:
    payload = base64.urlsafe_b64decode(ciphertext.encode("utf-8"))
    if len(payload) <= 32:
        raise ValueError("Invalid encrypted payload")
    cipher = payload[:-32]
    signature = payload[-32:]
    key = _derive_key(key_secret)
    expected = hmac.new(key, cipher, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        raise ValueError("Secret signature mismatch")
    data = bytes(byte ^ key[index % len(key)] for index, byte in enumerate(cipher))
    return data.decode("utf-8")


def mask_secret(secret: str) -> str:
    if not secret:
        return ""
    if len(secret) <= 2:
        return "*" * len(secret)
    return f"{secret[0]}{'*' * (len(secret) - 2)}{secret[-1]}"


def to_stored_config(payload: SmtpSettingsPayload, encryption_key: str) -> StoredSmtpConfig:
    validate_smtp_security_mode(port=payload.port, use_tls=payload.use_tls, use_ssl=payload.use_ssl)
    return StoredSmtpConfig(
        host=payload.host.strip(),
        port=payload.port,
        username=payload.username.strip(),
        use_tls=payload.use_tls,
        use_ssl=payload.use_ssl,
        password_encrypted=encrypt_secret(payload.password, encryption_key),
    )


def to_read_model(config: StoredSmtpConfig, encryption_key: str) -> SmtpConfigRead:
    password = decrypt_secret(config.password_encrypted, encryption_key)
    return SmtpConfigRead(
        host=config.host,
        port=config.port,
        username=config.username,
        use_tls=config.use_tls,
        use_ssl=config.use_ssl,
        password_masked=mask_secret(password),
    )


class SmtpEmailService:
    def __init__(
        self,
        *,
        sender: str,
        smtp_config: StoredSmtpConfig,
        encryption_key: str,
        transport: MockSmtpTransport | None = None,
    ) -> None:
        self.sender = sender
        self.smtp_config = smtp_config
        self.encryption_key = encryption_key
        self.transport = transport

    def send(self, message: MailMessage) -> MailDeliveryResult:
        if self.transport is not None:
            return self.transport.send(sender=self.sender, message=message, smtp=self.smtp_config)

        connected = False
        send_attempted = False
        try:
            validate_smtp_security_mode(
                port=self.smtp_config.port,
                use_tls=self.smtp_config.use_tls,
                use_ssl=self.smtp_config.use_ssl,
            )
            smtp_password = decrypt_secret(self.smtp_config.password_encrypted, self.encryption_key)
            email = EmailMessage()
            email["From"] = self.sender
            email["To"] = message.recipient
            email["Subject"] = message.subject
            email.set_content(message.body)

            if self.smtp_config.use_ssl:
                with smtplib.SMTP_SSL(
                    self.smtp_config.host,
                    self.smtp_config.port,
                    timeout=10,
                ) as client:
                    connected = True
                    client.login(self.smtp_config.username, smtp_password)
                    send_attempted = True
                    client.send_message(email)
            else:
                with smtplib.SMTP(self.smtp_config.host, self.smtp_config.port, timeout=10) as client:
                    connected = True
                    if self.smtp_config.use_tls:
                        client.starttls()
                    client.login(self.smtp_config.username, smtp_password)
                    send_attempted = True
                    client.send_message(email)
        except Exception as exc:
            raise SmtpDeliveryError(
                describe_smtp_transport_error(
                    str(exc),
                    port=self.smtp_config.port,
                    use_tls=self.smtp_config.use_tls,
                    use_ssl=self.smtp_config.use_ssl,
                ),
                connected=connected,
                send_attempted=send_attempted,
            ) from exc
        return MailDeliveryResult(connected=connected, send_attempted=send_attempted)


class FileEmailService:
    def __init__(self, *, capture_path: str) -> None:
        self.capture_path = Path(capture_path)

    def send(self, message: MailMessage) -> MailDeliveryResult:
        self.capture_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "recipient": message.recipient,
            "subject": message.subject,
            "body": message.body,
        }
        with self.capture_path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False))
            handle.write("\n")
        return MailDeliveryResult(connected=True, send_attempted=True)


def send_portal_onboarding(*, service: EmailService, recipient: str) -> MailDeliveryResult:
    return service.send(
        MailMessage(
            recipient=recipient,
            subject="KájovoHotel onboarding",
            body="Váš účet v KájovoHotel byl vytvořen.",
        )
    )


def send_admin_unlock_link(*, service: EmailService, recipient: str, unlock_link: str) -> MailDeliveryResult:
    return service.send(
        MailMessage(
            recipient=recipient,
            subject="KájovoHotel odblokování admin účtu",
            body=f"Pro odblokování admin účtu použijte odkaz: {unlock_link}",
        )
    )


def send_admin_password_hint(*, service: EmailService, recipient: str) -> MailDeliveryResult:
    return service.send(
        MailMessage(
            recipient=recipient,
            subject="KájovoHotel připomenutí admin hesla",
            body=(
                "Zapomenuté admin heslo se neresetuje. "
                "Heslo najdete v provozním správci hesel nebo v bezpečně uložené provozní dokumentaci."
            ),
        )
    )


def send_user_unlock_link(*, service: EmailService, recipient: str, unlock_link: str) -> MailDeliveryResult:
    return service.send(
        MailMessage(
            recipient=recipient,
            subject="KájovoHotel unlock účtu",
            body=f"Pro odblokování účtu použijte odkaz: {unlock_link}",
        )
    )


def send_user_password_reset_link(
    *, service: EmailService, recipient: str, reset_link: str
) -> MailDeliveryResult:
    return service.send(
        MailMessage(
            recipient=recipient,
            subject="KájovoHotel reset hesla",
            body=f"Pro reset hesla použijte odkaz: {reset_link}",
        )
    )


def build_email_service(
    settings: Settings,
    smtp_config: StoredSmtpConfig | None,
    transport: MockSmtpTransport | None = None,
) -> EmailService:
    if settings.smtp_capture_path.strip():
        return FileEmailService(capture_path=settings.smtp_capture_path.strip())
    if not settings.smtp_enabled or smtp_config is None:
        raise SmtpNotConfiguredError("Real SMTP is not configured")
    return SmtpEmailService(
        sender=settings.smtp_from_email,
        smtp_config=smtp_config,
        encryption_key=settings.smtp_encryption_key,
        transport=transport,
    )
