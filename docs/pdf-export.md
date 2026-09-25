# PDF export

Snídaňový přehled vzniká automatickou synchronizací z Better Hotel API. Nahrávání PDF ani ruční spuštění synchronizace nejsou součástí aplikace. Server nadále poskytuje `GET /api/v1/breakfast/export/daily?service_date=YYYY-MM-DD` pro oprávněné role `recepce` a `admin`; PDF vytváří `app.services.pdf.breakfast.build_breakfast_schedule_pdf`.

Inventurní seznamy v administraci a portálu používají `/api/v1/inventory/stocktake/pdf` pro inventurní protokol. Tuto funkci změna snídaní neovlivňuje.
