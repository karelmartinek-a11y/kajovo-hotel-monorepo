from tests.test_support import admin_email

ADMIN_EMAIL = admin_email()


def test_admin_profile_read_update_and_password_endpoint_absent(api_request) -> None:
    status, profile = api_request("/api/v1/admin/profile")
    assert status == 200
    assert isinstance(profile, dict)
    assert profile["email"] == ADMIN_EMAIL

    update_status, updated = api_request(
        "/api/v1/admin/profile",
        method="PUT",
        payload={"display_name": "Noční admin"},
    )
    assert update_status == 200
    assert isinstance(updated, dict)
    assert updated["display_name"] == "Noční admin"

    missing_status, missing_payload = api_request(
        "/api/v1/admin/profile/password",
        method="POST",
        payload={"old_password": "irrelevant-123", "new_password": "irrelevant-456"},
    )
    assert missing_status == 404
    assert isinstance(missing_payload, dict)
    assert missing_payload["detail"] == "Not Found"
