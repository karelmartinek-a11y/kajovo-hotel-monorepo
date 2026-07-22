from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from app.main import create_app


def _normalize_schema(node: Any) -> Any:
    if isinstance(node, dict):
        normalized = {key: _normalize_schema(value) for key, value in node.items()}
        if (
            normalized.get("type") == "string"
            and normalized.get("contentMediaType") == "application/octet-stream"
        ):
            normalized.pop("contentMediaType", None)
            normalized["format"] = "binary"
        return normalized
    if isinstance(node, list):
        return [_normalize_schema(item) for item in node]
    return node


def _normalize_openapi(schema: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize_schema(schema)
    validation_error = (
        normalized.get("components", {})
        .get("schemas", {})
        .get("ValidationError", {})
    )
    if isinstance(validation_error, dict):
        properties = validation_error.get("properties")
        if isinstance(properties, dict):
            properties.pop("ctx", None)
            properties.pop("input", None)
    return normalized


def main() -> None:
    app = create_app()
    schema = _normalize_openapi(app.openapi())
    output_path = APP_ROOT / "openapi.json"
    output_path.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
