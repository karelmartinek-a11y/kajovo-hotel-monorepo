from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
OPENAPI_PATH = ROOT / "apps/kajovo-hotel-api/openapi.json"
OUT_PATH = ROOT / "packages/shared/src/generated/client.ts"


def to_pascal(name: str) -> str:
    return "".join(part.capitalize() for part in re.split(r"[^a-zA-Z0-9]+", name) if part)


def to_camel(name: str) -> str:
    pascal = to_pascal(name)
    return pascal[:1].lower() + pascal[1:]


def sanitize(name: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    if re.match(r"^\d", clean):
        clean = f"_{clean}"
    return clean


def schema_to_ts(schema: dict[str, Any], refs: dict[str, dict[str, Any]]) -> str:
    if "$ref" in schema:
        return schema["$ref"].split("/")[-1]

    typ = schema.get("type")
    if "enum" in schema:
        return " | ".join(json.dumps(value) for value in schema["enum"])
    if "anyOf" in schema:
        return " | ".join(schema_to_ts(item, refs) for item in schema["anyOf"])
    if "oneOf" in schema:
        return " | ".join(schema_to_ts(item, refs) for item in schema["oneOf"])
    if "allOf" in schema:
        return " & ".join(schema_to_ts(item, refs) for item in schema["allOf"])
    if typ == "array":
        return f"Array<{schema_to_ts(schema['items'], refs)}>"
    if typ == "object" or "properties" in schema:
        props = schema.get("properties", {})
        required = set(schema.get("required", []))
        if not props:
            return "Record<string, unknown>"
        rows: list[str] = []
        for key, value in props.items():
            opt = "" if key in required else "?"
            rows.append(f"  {json.dumps(key)}{opt}: {schema_to_ts(value, refs)};")
        return "{\n" + "\n".join(rows) + "\n}"
    if typ in {"integer", "number"}:
        return "number"
    if typ == "string":
        return "string"
    if typ == "boolean":
        return "boolean"
    if typ == "null":
        return "null"
    return "unknown"


def get_json_response(operation: dict[str, Any]) -> str:
    responses = operation.get("responses", {})
    for status in ("200", "201"):
        response = responses.get(status)
        if not response:
            continue
        content = response.get("content", {})
        json_content = content.get("application/json")
        if not json_content:
            continue
        return schema_to_ts(json_content["schema"], {})
    return "void"


def get_body_type(operation: dict[str, Any]) -> str | None:
    request_body = operation.get("requestBody")
    if not request_body:
        return None
    content = request_body.get("content", {})
    json_content = content.get("application/json")
    if not json_content:
        return None
    return schema_to_ts(json_content["schema"], {})


def main() -> None:
    spec = json.loads(OPENAPI_PATH.read_text(encoding="utf-8"))
    schemas = spec.get("components", {}).get("schemas", {})
    lines: list[str] = [
        "/* eslint-disable */",
        "// Generated from apps/kajovo-hotel-api/openapi.json. Do not edit manually.",
        "",
    ]

    for name in sorted(schemas.keys()):
        schema = schemas[name]
        lines.append(f"export type {sanitize(name)} = {schema_to_ts(schema, schemas)};")

    lines.extend(
        [
            "",
            "type QueryValue = string | number | boolean | null | undefined;",
            "",
            "function buildQuery(query: Record<string, QueryValue> | undefined): string {",
            "  if (!query) return '';",
            "  const params = new URLSearchParams();",
            "  for (const [key, value] of Object.entries(query)) {",
            "    if (value === undefined || value === null) continue;",
            "    params.set(key, String(value));",
            "  }",
            "  const encoded = params.toString();",
            "  return encoded ? `?${encoded}` : '';",
            "}",
            "",
            "async function request<T>(method: string, path: string, query?: Record<string, QueryValue>, body?: unknown): Promise<T> {",
            "  const response = await fetch(`${path}${buildQuery(query)}`, {",
            "    method,",
            "    headers: body ? { 'Content-Type': 'application/json' } : undefined,",
            "    body: body ? JSON.stringify(body) : undefined,",
            "  });",
            "  if (!response.ok) throw new Error('API request failed');",
            "  if (response.status === 204) return undefined as T;",
            "  return (await response.json()) as T;",
            "}",
            "",
            "export const apiClient = {",
        ]
    )

    for path, methods in spec.get("paths", {}).items():
        for method, operation in methods.items():
            op_id = operation.get("operationId") or f"{method}_{path}"
            func_name = to_camel(op_id)
            response_type = get_json_response(operation)
            body_type = get_body_type(operation)

            path_params = [
                p for p in operation.get("parameters", []) if p.get("in") == "path"
            ]
            query_params = [
                p for p in operation.get("parameters", []) if p.get("in") == "query"
            ]

            args: list[str] = []
            for p in path_params:
                p_name = sanitize(p["name"])
                p_type = schema_to_ts(p.get("schema", {}), schemas)
                args.append(f"{p_name}: {p_type}")
            if query_params:
                fields = []
                required = {p["name"] for p in query_params if p.get("required")}
                for p in query_params:
                    name = p["name"]
                    q_type = schema_to_ts(p.get("schema", {}), schemas)
                    opt = "" if name in required else "?"
                    fields.append(f"{json.dumps(name)}{opt}: {q_type};")
                args.append(f"query: {{ {' '.join(fields)} }}")
            if body_type:
                args.append(f"body: {body_type}")

            args_joined = ", ".join(args)
            request_path = path
            for p in path_params:
                pname = sanitize(p["name"])
                request_path = request_path.replace("{" + p["name"] + "}", f"${{{pname}}}")

            query_arg = "query" if query_params else "undefined"
            body_arg = "body" if body_type else "undefined"
            lines.append(
                f"  async {func_name}({args_joined}): Promise<{response_type}> {{"
            )
            lines.append(
                f"    return request<{response_type}>('{method.upper()}', `{request_path}`, {query_arg}, {body_arg});"
            )
            lines.append("  },")

    lines.extend(["};", ""])

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
