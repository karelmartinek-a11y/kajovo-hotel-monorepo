from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from app.config import get_settings
from app.db.session import SessionLocal
from app.services.breakfast.mail_fetcher import BreakfastMailFetcher

log = logging.getLogger("kajovo.breakfast.scheduler")


async def breakfast_scheduler_loop() -> None:
    settings = get_settings()
    fetcher = BreakfastMailFetcher(settings)
    interval = max(60, int(settings.breakfast_scheduler_interval_seconds))

    while True:
        try:
            db = SessionLocal()
            try:
                target_day = datetime.now().date()
                await asyncio.to_thread(fetcher.fetch_and_store_for_day, db, target_day)
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Breakfast scheduler iteration failed")
        await asyncio.sleep(interval)
