"""Offline example host: replace these test ports when copying the product."""
import asyncio

import httpx
from voice_core_server import RealtimeSessionClient, VoiceCoreConfig


class TestAuth:
    def authorize(self):
        return "isolated-test-user"


class TestConfig:
    def read(self):
        return VoiceCoreConfig()


class TestSecrets:
    def __init__(self):
        self.key = None

    def read(self):
        assert self.key is not None
        return self.key

    def configured(self):
        return self.key is not None

    def save(self, value):
        self.key = value

    def delete(self):
        self.key = None


async def verify():
    auth, config, secrets = TestAuth(), TestConfig(), TestSecrets()
    auth.authorize()
    secrets.save("test-only-provider-key")
    assert secrets.configured()
    transport = httpx.MockTransport(lambda request: httpx.Response(201, text="v=0\r\nisolated-answer"))
    answer, model = await RealtimeSessionClient(transport).create("v=0\r\nisolated-offer", config.read(), secrets.read())
    assert answer.startswith("v=0") and model == "gpt-realtime-2.1"
    secrets.delete()
    assert not secrets.configured()
    print("Isolated server host ports PASS")


if __name__ == "__main__":
    asyncio.run(verify())
