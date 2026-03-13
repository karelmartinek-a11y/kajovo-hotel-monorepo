import hashlib
import hmac


def compute_device_token_hash(token: str, pepper: str | None = None) -> str:
    if pepper:
        return hmac.new(pepper.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
