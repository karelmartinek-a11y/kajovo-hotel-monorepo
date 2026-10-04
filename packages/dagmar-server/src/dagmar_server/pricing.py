"""Dated public-price snapshot. Unknown models never inherit another model's rate."""
SNAPSHOT = {
    "revision": "openai-2026-10-04-v1",
    "date": "2026-10-04",
    "source": "https://developers.openai.com/api/docs/pricing",
    "unit": "USD_per_1000000_tokens",
    "models": {
        "gpt-realtime-2.1": {
            "text": {"input": 4, "cached": 0.40, "output": 24},
            "audio": {"input": 32, "cached": 0.40, "output": 64},
            "image": {"input": 5, "cached": 0.50, "output": 0},
        },
    },
}
