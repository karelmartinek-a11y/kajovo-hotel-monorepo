# A) Cíl
- Aktualizovat závazná pravidla velikosti signace a sjednotit UI tokeny, CSS a testy pro desktop i mobil/tablet.

# B) Exit criteria
- Guardrails `ci:verification-doc` projde.
- CI testy signace (offset/min. výška/šířka) pro phone/tablet/desktop prochází.

# C) Změny
- Aktualizace SSOT pravidla v ManifestDesignKájovo.md (desktop 12 px, tablet+telefon 4,8 px, mobile web = Android).
- Aktualizace design tokenů a UI CSS pro nové rozměry signace.
- Úprava CI testů pro kontrolu min. tloušťky a šířky signace.

# D) Ověření
- `pnpm ci:signage`
- CI guardrails v PR

# E) Rizika/known limits
- Žádná změna business logiky; pouze branding + layout tokeny.

# F) Handoff pro další prompt
- Po zelených checkách mergnout PR a ověřit deploy workflow.
