"""Native audio confirmation vocabulary for Mail approval."""
import re
import unicodedata

def normalize(text):
    value = unicodedata.normalize("NFKD", text.casefold())
    return " ".join(re.findall(r"[^\W_]+", "".join(c for c in value if not unicodedata.combining(c))))

YES = {normalize(v) for v in ("ano", "ano potvrzuji", "potvrzuji", "áno", "potvrdzujem", "yes", "yes I confirm", "I confirm", "ja", "ich bestätige", "так", "підтверджую")}
