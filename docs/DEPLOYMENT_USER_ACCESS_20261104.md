# Centrální přidělování práv — přejímka 4. 11. 2026

Centrální správce uživatelů může připravovat profily a spravovat role i bez vlastního hotelového profilu. Podepsaná účelová identita dovoluje jen vymezené správní cesty; ostatní hotelové operace tímto grantem neotevře.

Zdroj [`51c61e8666b5`](https://github.com/karelmartinek-a11y/kajovo-hotel-monorepo/commit/51c61e8666b503f534661785b051f5e3d35a18b2), nasazená verze `coordinated-cml-user-access`. Zdroj, artefakt, běžící proces a výsledky kontrol jsou v [přejímce](DEPLOYMENT_USER_ACCESS_20261104.json).

Povinné [CI kontroly](https://github.com/karelmartinek-a11y/kajovo-hotel-monorepo/actions/runs/41820909159) prošly.

Obchodní a uživatelské změny byly ověřené v izolovaných fixtures. Produkční přejímka použila čtení a neuložené formuláře; nezměnila skutečné účty ani neodeslala zprávy.
