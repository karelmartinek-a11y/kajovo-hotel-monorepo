"""Read a ChatGPT photo from its HTTPS file reference without logging the URL."""

import http.client
import ipaddress
import re
import socket
import ssl
import threading
from io import BytesIO
from urllib.parse import urlsplit

from fastapi import HTTPException
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field
from starlette.datastructures import Headers, UploadFile

# Match the existing CML upload boundary.
MAX_PHOTO_BYTES = 8 * 1024 * 1024
FORMATS = {
    "JPEG": ("jpg", "image/jpeg"),
    "PNG": ("png", "image/png"),
    "WEBP": ("webp", "image/webp"),
}


class ChatFile(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    download_url: str = Field(min_length=1, max_length=16384, repr=False)
    file_id: str = Field(min_length=1, max_length=512)
    mime_type: str = Field(default="", max_length=127)
    file_name: str = Field(default="", max_length=200)


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host: str, address: str) -> None:
        super().__init__(host, timeout=12, context=ssl.create_default_context())
        self.address = address
        self.active_socket = None

    def connect(self) -> None:
        raw = socket.create_connection((self.address, 443), timeout=self.timeout)
        self.active_socket = raw
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
            self.active_socket = self.sock
        except BaseException:
            raw.close()
            raise

    def interrupt(self) -> None:
        sock = self.active_socket
        if sock is not None:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            sock.close()


def _address(url: str) -> tuple[str, str, str]:
    try:
        link = urlsplit(url)
        host = link.hostname
        if (
            link.scheme != "https"
            or not host
            or not re.fullmatch(r"[a-z0-9.-]+", host)
            or link.username is not None
            or link.password is not None
            or link.fragment
            or link.port not in (None, 443)
            or "\\" in url
            or any(not 32 < ord(char) < 127 for char in url)
        ):
            raise ValueError
    except ValueError:
        raise HTTPException(422, "Odkaz na přiloženou fotografii není platný.") from None
    try:
        entries = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        addresses = [ipaddress.ip_address(value[4][0]) for value in entries]
    except (OSError, ValueError):
        raise HTTPException(422, "Odkaz na fotografii se nepodařilo otevřít.") from None
    if not addresses or any(not address.is_global for address in addresses):
        raise HTTPException(422, "Odkaz na fotografii není veřejné HTTPS.")
    address = next((value for value in addresses if value.version == 4), addresses[0])
    path = (link.path or "/") + ("?" + link.query if link.query else "")
    return host, str(address), path


def _receive(connection: PinnedHTTPS, path: str) -> BytesIO:
    watchdog = threading.Timer(30, connection.interrupt)
    watchdog.daemon = True
    watchdog.start()
    try:
        connection.request(
            "GET", path, headers={"Accept-Encoding": "identity", "Connection": "close"}
        )
        with connection.getresponse() as response:
            if (
                response.status != 200
                or response.getheader("Content-Encoding", "identity").lower() != "identity"
            ):
                raise HTTPException(422, "Otevři platnou přiloženou fotografii.")
            lengths = response.headers.get_all("Content-Length", [])
            expected = None
            if lengths:
                if len(lengths) != 1 or not re.fullmatch(r"[0-9]{1,12}", lengths[0]):
                    raise HTTPException(422, "Přenos neposkytuje platnou délku souboru.")
                expected = int(lengths[0])
                if not 1 <= expected <= MAX_PHOTO_BYTES:
                    raise HTTPException(413, "Přiložená fotografie přesahuje limit 8 MiB.")
            result = BytesIO()
            while chunk := response.read1(min(65_536, MAX_PHOTO_BYTES + 1 - result.tell())):
                result.write(chunk)
                if result.tell() > MAX_PHOTO_BYTES:
                    raise HTTPException(413, "Přiložená fotografie přesahuje limit 8 MiB.")
            if not result.tell() or (expected is not None and result.tell() != expected):
                raise HTTPException(422, "Fotografii se nepodařilo načíst celou.")
            result.seek(0)
            return result
    except (OSError, http.client.HTTPException):
        raise HTTPException(422, "Fotografii se nepodařilo načíst.") from None
    finally:
        watchdog.cancel()
        connection.close()
        connection.interrupt()


def download_photo(file: ChatFile) -> UploadFile:
    host, address, target = _address(file.download_url)
    content = _receive(PinnedHTTPS(host, address), target)
    try:
        with Image.open(content) as image:
            try:
                extension, media_type = FORMATS[image.format]
            except KeyError:
                raise HTTPException(422, "Použij JPEG, PNG nebo WebP.") from None
            image.verify()
    except (OSError, SyntaxError, Image.DecompressionBombError):
        content.close()
        raise HTTPException(422, "Přiložený soubor nemá platný obrazový obsah.") from None
    content.seek(0)
    return UploadFile(
        file=content,
        filename=f"photo.{extension}",
        headers=Headers({"Content-Type": media_type}),
    )
