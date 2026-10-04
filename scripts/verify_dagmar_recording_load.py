"""Unpaid real-time diagnostic load. No provider/MCP/production data access."""

import argparse
import asyncio
import base64
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
from dagmar_server import collector as module
from dagmar_server.diagnostics import Diagnostics


def percentile(values, fraction):
    return (
        sorted(values)[min(len(values) - 1, int((len(values) - 1) * fraction))]
        if values
        else None
    )


async def exercise(root, duration, rate, history):
    diagnostic = Diagnostics(
        root, base64.b64encode(os.urandom(32)).decode(), release="isolated-load"
    )
    historical = diagnostic.create_call("history")["logical_call_id"]
    for offset in range(0, history, 128):
        diagnostic.write_many(
            historical,
            "history",
            [
                dict(
                    id="history_" + str(i),
                    category="technical",
                    kind="history",
                    payload=(
                        "synthetic historical metadata " + str(i) + " " + "x" * 256
                    ).encode(),
                )
                for i in range(offset, min(offset + 128, history))
            ],
        )
    diagnostic.close(historical, "history")
    seeded_index_bytes = diagnostic.size(diagnostic.dbfile)
    module.store = lambda: diagnostic
    original = diagnostic.event_batch
    lags = []
    critical_lags = []
    expected = set()
    stored = set()
    event_loop_lags = []
    audio_count = 0

    def measured(call, owner, events, **kwargs):
        result = original(call, owner, events, **kwargs)
        stamp = time.monotonic() * 1000
        for event in events:
            lag = (stamp - event.monotonic_ms) / 1000
            lags.append(lag)
            if not event.event_type.endswith(".delta"):
                critical_lags.append(lag)
                if event.provider_event_id:
                    stored.add(event.provider_event_id)
        return result

    diagnostic.event_batch = measured
    fsync = os.fsync

    def slow_fsync(fd):
        time.sleep(0.005)
        fsync(fd)

    os.fsync = slow_fsync
    collectors = []
    segments = []
    for i in range(4):
        call = diagnostic.create_call("load")["logical_call_id"]
        diagnostic.connection(
            call, "load", "load_connection_" + str(i), "mock-provider", 1
        )
        segments.append(diagnostic.start(call, "load", 0))
        value = module.Collector(
            call, "load", "load_connection_" + str(i), "mock-provider"
        )
        collectors.append(value)
        value.start()
    started = time.monotonic()
    finished = asyncio.Event()

    async def ticker():
        while not finished.is_set():
            then = time.monotonic()
            await asyncio.sleep(0.01)
            event_loop_lags.append(max(0, time.monotonic() - then - 0.01))

    async def producer(index):
        value = collectors[index]
        emitted = 0
        next_transition = 0
        while time.monotonic() - started < duration:
            elapsed = time.monotonic() - started
            # Four concurrent calls, 2x observed peak each, periodic short 8x bursts.
            factor = 8 if 20 <= elapsed % 60 < 22 else 1
            target = int(elapsed * rate)
            count = max(0, target - emitted)
            for _ in range(count * factor):
                value.emit(
                    {
                        "type": "response.output_audio.delta",
                        "event_id": "delta_" + str(index) + "_" + str(value.sequence),
                        "response_id": "response_" + str(index),
                    }
                )
            emitted = target
            if elapsed >= next_transition:
                identity = "critical_" + str(index) + "_" + str(value.sequence)
                expected.add(identity)
                value.emit(
                    {"type": "memory.write.result", "event_id": identity, "code": "ok"}
                )
                if int(next_transition) % 4 == 0:
                    rid = "response_" + str(index) + "_" + str(int(next_transition))
                    done = identity + "_usage"
                    expected.add(done)
                    value.emit(
                        {
                            "type": "response.done",
                            "event_id": done,
                            "response": {
                                "id": rid,
                                "status": "completed",
                                "usage": {
                                    "input_tokens": 1,
                                    "output_tokens": 1,
                                    "total_tokens": 2,
                                },
                            },
                        }
                    )
                next_transition += 0.5
            await asyncio.sleep(0.01)

    async def audio(index):
        nonlocal audio_count
        value = collectors[index]
        segment = segments[index]
        sequence = 0
        while time.monotonic() - started < duration:
            await asyncio.sleep(0.15)  # slow upload, independent of Realtime producer
            elapsed = (time.monotonic() - started) * 1000
            for source in ("microphone", "remote"):
                identity = "audio_" + str(index) + "_" + source + "_" + str(sequence)
                details = dict(
                    segment_id=segment["segment_id"],
                    generation=segment["generation"],
                    capture_start=max(0, elapsed - 1000),
                    capture_end=elapsed,
                )
                info = dict(
                    track_id=source,
                    recording_id="recording_" + str(index) + "_" + source,
                    source_id=source,
                    mime="audio/pcm",
                    sequence=sequence,
                    final=False,
                    **details,
                )
                await asyncio.to_thread(
                    diagnostic.write_many,
                    value.call_id,
                    "load",
                    [
                        dict(
                            id=identity,
                            category="audio",
                            kind="audio",
                            payload=b"\0" * 8000,
                            source=source,
                            sequence=sequence,
                            **details,
                        ),
                        dict(
                            id=identity + "_manifest",
                            category="text",
                            kind="audio_manifest",
                            payload=json.dumps(info).encode(),
                            **details,
                        ),
                    ],
                )
                audio_count += 1
            sequence += 1
            await asyncio.sleep(0.85)

    try:
        beat = asyncio.create_task(ticker())
        await asyncio.gather(
            *(producer(i) for i in range(4)), *(audio(i) for i in range(4))
        )
        await asyncio.gather(*(value.close() for value in collectors))
        finished.set()
        await beat
        for value, segment in zip(collectors, segments):
            diagnostic.stop(
                value.call_id,
                "load",
                segment["segment_id"],
                (time.monotonic() - started) * 1000,
                False,
            )
            diagnostic.close(value.call_id, "load")
        diagnostic.reconcile()
        status = [v.status() for v in collectors]
        return {
            "duration_seconds": time.monotonic() - started,
            "concurrent_calls": 4,
            "delta_rate_per_call_second": rate,
            "short_burst_multiplier": 8,
            "slow_fsync_ms": 5,
            "slow_upload_ms": 150,
            "historical_records": history,
            "seeded_index_bytes": seeded_index_bytes,
            "storage_lag_seconds": {
                "p95": percentile(lags, 0.95),
                "p99": percentile(lags, 0.99),
                "max": max(lags, default=0),
            },
            "critical_lag_seconds": {
                "p95": percentile(critical_lags, 0.95),
                "p99": percentile(critical_lags, 0.99),
            },
            "critical_expected": len(expected),
            "critical_stored": len(stored),
            "critical_missing": len(expected - stored),
            "statuses": status,
            "event_loop_lag_seconds": {
                "p99": percentile(event_loop_lags, 0.99),
                "max": max(event_loop_lags, default=0),
            },
            "atomic_audio_pairs": audio_count,
            "paid_provider_called": False,
            "production_data_accessed": False,
        }
    finally:
        os.fsync = fsync


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=float, default=600)
    parser.add_argument("--rate", type=int, default=116)
    parser.add_argument("--history", type=int, default=150000)
    parser.add_argument("--evidence", required=True)
    args = parser.parse_args()
    hashes = {
        name: hashlib.sha256(Path(name).read_bytes()).hexdigest()
        for name in [
            "packages/dagmar-server/src/dagmar_server/diagnostics.py",
            "packages/dagmar-server/src/dagmar_server/collector.py",
        ]
    }
    with tempfile.TemporaryDirectory(prefix="dagmar-isolated-load-") as root:
        proof = asyncio.run(exercise(root, args.duration, args.rate, args.history))
    proof["source_sha256"] = hashes
    proof["targets_met"] = (
        proof["storage_lag_seconds"]["p95"] <= 1
        and proof["storage_lag_seconds"]["p99"] <= 2
        and proof["critical_missing"] == 0
    )
    Path(args.evidence).write_text(json.dumps(proof, indent=2) + "\n")
    print(json.dumps(proof))
    if not proof["targets_met"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
