"""Unpaid synthetic AAC/fMP4 storage+export decode. No Safari/physical claim.

Requires PyAV and numpy in the invoking environment; fixtures stay in RAM/temp.
"""

import argparse
import base64
import io
import json
import os
from pathlib import Path
import tempfile

import av
import numpy as np
from dagmar_server.diagnostics import Diagnostics


def container(frequency):
    output = io.BytesIO()
    mux = av.open(
        output,
        "w",
        format="mp4",
        options={
            "movflags": "empty_moov+default_base_moof",
            "frag_duration": "1000000",
        },
    )
    stream = mux.add_stream("aac", rate=48000)
    stream.layout = "mono"
    for i in range(141):
        samples = (
            (0.1 * np.sin(2 * np.pi * frequency * (np.arange(1024) + i * 1024) / 48000))
            .astype("float32")
            .reshape(1, -1)
        )
        frame = av.AudioFrame.from_ndarray(samples, format="fltp", layout="mono")
        frame.sample_rate = 48000
        for packet in stream.encode(frame):
            mux.mux(packet)
    for packet in stream.encode(None):
        mux.mux(packet)
    mux.close()
    return output.getvalue()


def fragments(data):
    cuts = []
    offset = 0
    while offset < len(data):
        size = int.from_bytes(data[offset : offset + 4], "big")
        kind = data[offset + 4 : offset + 8]
        if not size:
            break
        if kind in {b"moof", b"mfra"}:
            cuts.append(offset)
        offset += size
    assert len(cuts) >= 3
    # Capture chunk zero includes container/init and its first media fragment.
    boundaries = [0, *cuts[1:], len(data)]
    return [data[a:b] for a, b in zip(boundaries, boundaries[1:])]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True)
    args = parser.parse_args()
    proof = {
        "environment": "isolated synthetic AAC/fMP4, PyAV",
        "physical_audio": False,
        "safari_mediarecorder": False,
        "provider_called": False,
        "mcp_called": False,
        "recordings": [],
    }
    with tempfile.TemporaryDirectory(prefix="dagmar-mp4-") as root:
        store = Diagnostics(root, base64.b64encode(os.urandom(32)).decode())
        call = store.create_call("isolated")["logical_call_id"]
        for epoch in range(
            3
        ):  # On/Off and reconnect produce new init/sequence namespaces.
            segment = store.start(call, "isolated", epoch * 10000)
            for source, hz in [("microphone", 440), ("remote", 660)]:
                parts = fragments(container(hz))
                identities = []
                for sequence, payload in enumerate(parts):
                    identity = f"{epoch}_{source}_{sequence}"
                    identities.append(identity)
                    info = {
                        **segment,
                        "recording_id": f"{source}_{epoch}",
                        "track_id": f"track_{source}_{epoch}",
                        "source_id": source,
                        "mime": "audio/mp4",
                        "sequence": sequence,
                        "final": sequence == len(parts) - 1,
                        "capture_start_ms": epoch * 10000 + sequence * 100,
                        "capture_end_ms": epoch * 10000 + (sequence + 1) * 100,
                    }
                    details = dict(
                        segment_id=segment["segment_id"],
                        generation=segment["generation"],
                        capture_start=info["capture_start_ms"],
                        capture_end=info["capture_end_ms"],
                    )
                    store.write_many(
                        call,
                        "isolated",
                        [
                            dict(
                                id=identity,
                                category="audio",
                                kind="audio",
                                payload=payload,
                                sequence=sequence,
                                source=source,
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
                exported = {
                    r["id"]: payload
                    for r, payload in store.objects_for_export(call)
                    if r["id"] in identities
                }
                binary = b"".join(exported[key] for key in identities)
                decoded = sum(
                    frame.samples
                    for frame in av.open(io.BytesIO(binary)).decode(audio=0)
                )
                assert decoded >= 140 * 1024
                init_missing = False
                try:
                    sum(
                        frame.samples
                        for frame in av.open(io.BytesIO(b"".join(parts[1:]))).decode(
                            audio=0
                        )
                    )
                except Exception:
                    init_missing = True
                assert init_missing
                proof["recordings"].append(
                    {
                        "epoch": epoch,
                        "source": source,
                        "chunks": len(parts),
                        "decoded_samples": decoded,
                        "final_present": True,
                        "missing_init_decode_rejected": True,
                    }
                )
            store.stop(
                call, "isolated", segment["segment_id"], epoch * 10000 + 5000, True
            )
        view = store.manifest(call)
        assert len(view["audio"]["tracks"]) == 6 and all(
            t["complete"] for t in view["audio"]["tracks"]
        )
        proof["all_pairs_atomic"] = (
            view["audio"]["unpaired_audio"] == view["audio"]["unpaired_manifests"] == 0
        )
    Path(args.evidence).write_text(json.dumps(proof, indent=2) + "\n")
    print(json.dumps(proof))


if __name__ == "__main__":
    main()
