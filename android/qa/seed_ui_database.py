"""Seed an isolated local API database for native UI QA; never use production."""
import hashlib
import os
from datetime import date, datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.db.models import Base, PortalUser, PortalUserRole, Report, Issue, InventoryItem, LostFoundItem, BreakfastOrder

url = os.environ["KAJOVO_API_DATABASE_URL"]
if not url.startswith("sqlite:////tmp/kajovo-native-qa-"):
    raise SystemExit("Only an isolated /tmp/kajovo-native-qa-* SQLite database is allowed")
engine = create_engine(url)
Base.metadata.create_all(engine)
salt = os.urandom(16)
digest = hashlib.scrypt(b"NativeQa2026!", salt=salt, n=2**14, r=8, p=1)
with Session(engine) as db:
    user = PortalUser(first_name="Test", last_name="Android", email="native-qa@example.test",
        password_hash=f"scrypt${salt.hex()}${digest.hex()}", is_active=True)
    user.roles = [PortalUserRole(role=r) for r in ["recepce", "pokojská", "údržba", "snídaně", "sklad"]]
    db.add(user)
    db.add(Report(title="Kontrola směny", description="Předání klíčů a kontrola společných prostor.", status="open"))
    db.add(Issue(title="Výměna žárovky", description="Nesvítí lampička u postele.", location="Pokoj 101", room_number="101", priority="medium", status="new"))
    db.add(InventoryItem(name="Ručníky", unit="ks", min_stock=10, current_stock=24))
    db.add(LostFoundItem(description="Modrý deštník", category="ostatní", location="Recepce", room_number="101", event_at=datetime.now(timezone.utc), status="new", item_type="found"))
    db.add(BreakfastOrder(service_date=date.today(), room_number="101", guest_name="Testovací host", guest_count=2, status="pending"))
    db.commit()
print("Isolated native QA database ready")
