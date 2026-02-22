# Prompt ORF-05 / 07 – Security notes (auth)

- Admin autentizace je fixní singleton model: pouze `admin_email` + `admin_password` z konfigurace, bez runtime password mutace.
- Neexistuje API endpoint pro změnu admin hesla (`/api/auth/admin/password` vrací 404).
- Forgot admin password je omezen na hint email flow přes `/api/auth/admin/hint`; flow neprovádí password reset.
- Hint flow je abstrahován přes jednotný `MailService` kontrakt:
  - `MockMailService` pro prostředí bez SMTP,
  - `SmtpMailService` placeholder pro SMTP-enabled režim.
- API i UI používají stejný hint endpoint kontrakt, čímž se eliminuje divergentní behavior mezi klienty.
