"""Atomic CML-owned profile creation; no native onboarding or credential output."""
from __future__ import annotations

import hashlib
import json
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError, field_validator
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.db.models import CmlProfileProvision, PortalUser


class ProfileFault(Exception):
    def __init__(self, code, status=409):
        self.code, self.status = code, status
        super().__init__(code)


class ProvisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    operation_id: str
    central_user_id: str
    profile: dict

    @field_validator("operation_id", "central_user_id")
    @classmethod
    def canonical_uuid(cls, value):
        if str(UUID(value)) != value:
            raise ValueError("Canonical UUID required")
        return value


class ProfileProvisioner:
    def __init__(self, session_factory):
        self.session_factory = session_factory

    def _result(self, db, receipt):
        user = db.get(PortalUser, receipt.native_id)
        return {"contract": "kajovo-profile-provision/1", "state": "confirmed" if user else "unavailable",
                "operation_id": receipt.operation_id, "central_user_id": receipt.central_user_id,
                "fingerprint": receipt.fingerprint, "native_id": str(receipt.native_id),
                "profile": current_profile(user) if user else None}

    def read(self, ident):
        try:
            if str(UUID(ident)) != ident:
                raise ValueError()
        except ValueError as exc:
            raise ProfileFault("PROFILE_OPERATION_INVALID", 400) from exc
        with self.session_factory() as db:
            receipt = db.get(CmlProfileProvision, ident)
            return self._result(db, receipt) if receipt else {"state": "not_found"}

    def create(self, raw):
        try:
            value = ProvisionInput.model_validate_json(raw)
            profile = validate_profile(value.profile)
        except (ValidationError, ValueError, TypeError) as exc:
            # Validation errors may contain credential-like input; never echo it.
            raise ProfileFault("PROFILE_INPUT_INVALID", 422) from exc
        fingerprint = hashlib.sha256(json.dumps({"central_user_id": value.central_user_id,
            "profile": profile}, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        with self.session_factory() as db:
            if db.get_bind().dialect.name == "postgresql":
                # Lock before any existence check. A second worker can otherwise
                # miss the receipt and then observe the first worker's email.
                names = ["cml-profile-operation:" + value.operation_id,
                         "cml-profile-identity:" + value.central_user_id]
                locks = sorted(int.from_bytes(hashlib.sha256(name.encode()).digest()[:8],
                                               "big", signed=True) for name in names)
                for ident in locks:
                    db.execute(text("SELECT pg_advisory_xact_lock(:ident)"), {"ident": ident})
            prior = db.get(CmlProfileProvision, value.operation_id)
            if prior:
                if prior.fingerprint != fingerprint:
                    raise ProfileFault("PROFILE_OPERATION_CONFLICT")
                return self._result(db, prior)
            if db.scalar(select(CmlProfileProvision).where(CmlProfileProvision.central_user_id == value.central_user_id)):
                raise ProfileFault("PROFILE_IDENTITY_EXISTS")
            if db.scalar(select(PortalUser).where(func.lower(PortalUser.email) == profile["email"])):
                raise ProfileFault("PROFILE_EMAIL_EXISTS")
            try:
                user = create_profile(db, profile)
                db.flush()
                receipt = CmlProfileProvision(operation_id=value.operation_id,
                    central_user_id=value.central_user_id, fingerprint=fingerprint, native_id=user.id)
                db.add(receipt)
                db.flush()
                result = self._result(db, receipt)
                db.commit()
                return result
            except IntegrityError as exc:
                # Creation and receipt are one transaction. A losing worker cannot
                # leave a user/Instance behind or adopt an existing email account.
                db.rollback()
                prior = db.get(CmlProfileProvision, value.operation_id)
                if prior and prior.fingerprint == fingerprint:
                    return self._result(db, prior)
                raise ProfileFault("PROFILE_CONFLICT") from exc


def validate_profile(value):
    from app.api.schemas import PortalUserBasePayload

    class Profile(PortalUserBasePayload):
        model_config = ConfigDict(extra="forbid", strict=True)

    result = Profile.model_validate(value).model_dump()
    result["roles"] = sorted(result["roles"])
    return result


def create_profile(db, value):
    import secrets
    from app.db.models import PortalUserRole
    from app.security.passwords import hash_password

    user = PortalUser(**{k: v for k, v in value.items() if k != "roles"},
        is_active=True, password_hash=hash_password(secrets.token_urlsafe(48)),
        roles=[PortalUserRole(role=role) for role in value["roles"]])
    db.add(user)
    return user


def current_profile(user):
    return {"first_name": user.first_name, "last_name": user.last_name, "email": user.email,
            "phone": user.phone, "note": user.note, "is_active": user.is_active,
            "roles": sorted(role.role for role in user.roles)}
