"""Dated public-price snapshot. Unknown models never inherit another model's rate."""
SNAPSHOT = {
    "revision": "openai-2026-10-04-v1",
    "date": "2026-10-04",
    "source": "https://developers.openai.com/api/docs/pricing",
    "unit": "USD_per_1000000_tokens",
    "models": {
        "gpt-4.1-mini-2025-04-14": {"kind":"text", "text":{"input":0.40,"cached":0.10,"output":1.60}},
        "gpt-4o-mini-transcribe": {"kind":"transcription", "audio":{"input":1.25,"output":5.00}},
        "gpt-realtime-2.1": {
            "text": {"input": 4, "cached": 0.40, "output": 24},
            "audio": {"input": 32, "cached": 0.40, "output": 64},
            "image": {"input": 5, "cached": 0.50, "output": 0},
        },
    },
}
