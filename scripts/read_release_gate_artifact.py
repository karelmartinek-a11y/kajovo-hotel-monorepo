"""Read deploy scope only from the exact successful CI Gates artifact."""
import argparse
import json
import re
from pathlib import Path


def read(path: Path, sha: str) -> bool:
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise RuntimeError("exact_gate_sha_required")
    evidence = json.loads(path.read_text())
    if (evidence.get("sha") != sha or not isinstance(evidence.get("deploy_required"), bool)
            or evidence.get("workflow") != "ci-gates" or evidence.get("overall_status") != "PASS"):
        raise RuntimeError("exact_release_gate_scope_required")
    return evidence["deploy_required"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", type=Path, required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--github-output", type=Path, required=True)
    args = parser.parse_args()
    value = read(args.path, args.sha)
    with args.github_output.open("a") as output:
        output.write(f"deploy_required={str(value).lower()}\n")
    print("Release needs runtime deployment" if value else "CI verified a change without runtime deployment")
