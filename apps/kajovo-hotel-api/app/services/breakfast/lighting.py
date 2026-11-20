"""The Hotel client can invoke only the dedicated Smart breakfast tool."""
import asyncio
import json
import os
import re
import stat
from pathlib import Path

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

CONFIG = Path("/app/data/credentials/breakfast-lighting.json")
TOOL = "hotel_breakfast_lighting"


def load_config() -> dict[str, str]:
    fd = os.open(CONFIG, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > 4096:
            raise ValueError("Invalid breakfast lighting configuration")
        config = json.load(stream)
    if (not isinstance(config, dict)
            or not re.fullmatch(r"https://kajovosmart-mcp\.hcasc\.cz/mcp/access/[a-f0-9-]{36}", config.get("endpoint", ""))
            or not re.fullmatch(r"[A-Za-z0-9_-]{43}", config.get("token", ""))):
        raise ValueError("Invalid breakfast lighting configuration")
    return config


def configured() -> bool:
    try:
        load_config()
    except (OSError, ValueError, TypeError):
        return False
    return True


async def smart_lighting(config: dict[str, str], arguments: dict) -> dict:
    async with asyncio.timeout(12):
        async with streamablehttp_client(
            config["endpoint"], headers={"Authorization": "Bearer " + config["token"]},
            timeout=8, sse_read_timeout=10,
        ) as (reader, writer, _):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                result = await session.call_tool(TOOL, arguments)
    body = result.structuredContent
    if not isinstance(body, dict):
        raise ValueError("Invalid breakfast lighting response")
    if result.isError:
        if body.get("error_code") in {
            "breakfast_scenario_action_unresolved", "breakfast_scenario_schedule_unresolved",
            "breakfast_lighting_membership_changed",
        }:
            raise LightingScheduleUnavailable
        raise ValueError("Breakfast lighting command unavailable")
    if (type(body.get("active")) is not bool or type(body.get("revision")) is not int
            or body.get("status") not in {"ready", "pending", "success", "partial", "interrupted"}):
        raise ValueError("Invalid breakfast lighting status")
    return {key: body[key] for key in ("active", "status", "revision")}


class LightingScheduleUnavailable(Exception):
    pass
