# ORF-07 Prompt 10 – Security notes

- SMTP password se do DB ukládá pouze jako `password_encrypted` (nikdy plaintext).
- API read model vrací jen `password_masked`.
- Šifrovaný payload obsahuje integritní podpis (HMAC), decrypt failuje při mismatch.
- SMTP klíč je oddělený config (`KAJOVO_API_SMTP_ENCRYPTION_KEY`) a nesmí být hardcoded pro produkci.
- Admin password hint flow zůstává v režimu "immutable admin password" a pouze odesílá hint email.
