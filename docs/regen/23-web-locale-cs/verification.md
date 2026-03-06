# A) Cíl
- Opravit rozbité kódování českých textů na webovém portálu hotel.hcasc.cz.

# B) Exit criteria
- Guardrails `ci:verification-doc` projde.
- UI texty na webu i v adminu se zobrazují česky bez mojibake.

# C) Změny
- Normalizace českých textů v UI portálu a adminu (oprava mojibake v textových řetězcích).

# D) Ověření
- CI (guardrails, lint, unit, web-tests, e2e) v PR.

# E) Rizika/known limits
- Změna je čistě v textových řetězcích, bez zásahu do logiky.

# F) Handoff pro další prompt
- Po zelených checkách mergnout PR a ověřit deploy workflow.
