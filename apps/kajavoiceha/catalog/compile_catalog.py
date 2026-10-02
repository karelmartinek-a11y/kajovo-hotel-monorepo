#!/usr/bin/env python3
"""Compile an approved device workbook into a private adapter and a neutral catalog.

Inputs are explicit local paths. Credentials are never accepted or embedded here.
The workbook determines membership, names, locations, kinds and permitted services.
Entity metadata refines those approved services; it cannot grant a new service/device.
"""
import argparse
import collections
import hashlib
import json
import os
import pathlib
import re
import unicodedata
from xml.etree import ElementTree as ET
from zipfile import ZipFile

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
FIELDS = [
    {"key": "name", "label": "Název zařízení"},
    {"key": "location", "label": "Umístění"},
    {"key": "kind", "label": "Druh zařízení"},
    {"key": "controls", "label": "Ovládací funkce"},
    {"key": "readings", "label": "Čitelné údaje"},
    {"key": "current_state", "label": "Aktuální stav"},
    {"key": "possible_states", "label": "Možné stavy a rozsahy"},
    {"key": "availability", "label": "Dostupnost"},
]
SECRET = re.compile(r"token|password|secret|api_key|authorization|credential", re.I)
INTERNAL_ATTRIBUTES = {"friendly_name", "entity_picture", "supported_features", "device_class", "state_class", "unit_of_measurement"}
ATTRIBUTE_LABELS = {
    "state": "Stav", "brightness": "Jas (0–255)", "color_mode": "Režim barvy",
    "color_temp_kelvin": "Teplota bílé", "hs_color": "Odstín a sytost",
    "rgb_color": "Barva RGB", "rgbw_color": "Barva RGB s bílou",
    "rgbww_color": "Barva RGB se dvěma bílými", "xy_color": "Barevné souřadnice",
    "min_color_temp_kelvin": "Nejnižší teplota bílé", "max_color_temp_kelvin": "Nejvyšší teplota bílé",
    "supported_color_modes": "Podporované barevné režimy", "options": "Dostupné volby",
    "event_type": "Druh poslední události", "event_types": "Možné události",
    "message": "Zpráva poslední události",
    "brand": "Značka", "model_name": "Model", "motion_detection": "Detekce pohybu",
    "effect": "Efekt", "effect_list": "Dostupné efekty", "available_tones": "Dostupné tóny",
    "temperature": "Teplota", "humidity": "Vlhkost", "battery": "Baterie",
}
PARAMETERS = {
    "transition": ("transition_seconds", "Doba přechodu v sekundách"),
    "rgb_color": ("rgb", "Barva jako tři složky 0–255"),
    "color_temp_kelvin": ("white_temperature_kelvin", "Teplota bílé v kelvinech"),
    "brightness_pct": ("brightness_percent", "Jas v procentech"),
    "brightness_step_pct": ("brightness_change_percent", "Změna jasu v procentních bodech"),
    "rgbw_color": ("rgbw", "Čtyři složky barvy 0–255"),
    "rgbww_color": ("rgbww", "Pět složek barvy 0–255"),
    "color_name": ("color", "Název barvy"),
    "hs_color": ("hue_saturation", "Odstín 0–360 a sytost 0–100"),
    "xy_color": ("chromaticity", "Dvě barevné souřadnice 0–1"),
    "brightness": ("brightness_level", "Jas na stupnici 0–255"),
    "brightness_step": ("brightness_change", "Změna jasu na stupnici zařízení"),
    "option": ("value", "Konkrétní volba"), "cycle": ("cycle", "Po poslední volbě pokračovat první"),
    "duration": ("duration_sec", "Délka v sekundách"),
    "lookback": ("lookback_sec", "Délka předzáznamu v sekundách"),
    "tone": ("tone", "Tón"), "volume_level": ("volume", "Hlasitost 0–1"),
    "effect": ("effect", "Efekt"), "flash": ("flash", "Bliknutí"), "white": ("white_only", "Pouze bílá"),
}
SERVICE_LABELS = {
    "turn_on": "Zapnout", "turn_off": "Vypnout", "toggle": "Přepnout",
    "select_first": "Vybrat první volbu", "select_last": "Vybrat poslední volbu",
    "select_next": "Vybrat další volbu", "select_previous": "Vybrat předchozí volbu",
    "select_option": "Nastavit volbu", "press": "Stisknout",
    "enable_motion_detection": "Zapnout detekci pohybu", "disable_motion_detection": "Vypnout detekci pohybu",
    "play_stream": "Přehrát živý obraz", "record": "Pořídit videozáznam",
    "snapshot": "Získat aktuální fotografii",
}
MODE_LABELS = {"hs": "barevné světlo", "xy": "barevné světlo", "rgb": "barevné světlo", "rgbw": "barevné světlo s bílou", "rgbww": "barevné světlo se dvěma bílými", "color_temp": "nastavitelná teplota bílé", "brightness": "nastavitelný jas", "onoff": "zapnutí a vypnutí", "white": "bílá"}


def fold(value):
    return "".join(c for c in unicodedata.normalize("NFD", value.casefold()) if unicodedata.category(c) != "Mn")


def workbook_rows(path):
    with ZipFile(path) as archive:
        strings = ["".join(x.itertext()) for x in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", NS)] if "xl/sharedStrings.xml" in archive.namelist() else []
        rows = []
        for row in ET.fromstring(archive.read("xl/worksheets/sheet1.xml")).findall("s:sheetData/s:row", NS):
            cells = {}
            for cell in row.findall("s:c", NS):
                v = cell.find("s:v", NS)
                inline = cell.find("s:is", NS)
                text = v.text if v is not None else "".join(inline.itertext()) if inline is not None else ""
                if cell.get("t") == "s":
                    text = strings[int(text)]
                if text:
                    cells[re.sub(r"\d", "", cell.get("r"))] = text
            rows.append((int(row.get("r")), cells))
    headers = dict(rows).get(6, {})
    if headers.get("D") != "MCP" or headers.get("R") != "Stabilní klíč zařízení" or headers.get("V") != "Vazby na entity":
        raise ValueError("Workbook layout differs from the approved schema")
    return [(n, cells) for n, cells in rows if n >= 7 and cells.get("A")]


def neutral(value):
    if isinstance(value, dict):
        return {k: neutral(v) for k, v in value.items() if not SECRET.search(k) and k not in INTERNAL_ATTRIBUTES}
    if isinstance(value, list):
        return [neutral(x) for x in value]
    if isinstance(value, str):
        if re.search(r"home[ _-]*assistant|\bha\b|https?://|(?:camera|light|switch|sensor|select|binary_sensor)\.[\w-]+", value, re.I):
            raise ValueError("A backend identifier would leak into public content")
        return value
    return value


def public_mode(value):
    if isinstance(value, list):
        return list(dict.fromkeys(MODE_LABELS.get(x, x) for x in value))
    return MODE_LABELS.get(value, value)


def state_labels(domain, device_class):
    binary = {
        "motion": ("pohyb", "bez pohybu"), "occupancy": ("obsazeno", "neobsazeno"),
        "door": ("otevřeno", "zavřeno"), "window": ("otevřeno", "zavřeno"), "opening": ("otevřeno", "zavřeno"),
        "smoke": ("kouř zjištěn", "bez kouře"), "tamper": ("narušení", "bez narušení"),
        "problem": ("problém", "bez problému"), "battery": ("nízká baterie", "baterie v pořádku"),
        "moisture": ("vlhkost zjištěna", "sucho"), "safety": ("nebezpečí", "bezpečno"),
    }
    on, off = binary.get(device_class, ("aktivní", "neaktivní")) if domain == "binary_sensor" else ("zapnuto", "vypnuto")
    return {"on": on, "off": off, "unknown": "stav neznámý", "unavailable": "nedostupné", "idle": "připraveno", "recording": "nahrává", "streaming": "přenáší obraz"}


def parameter_schema(name, spec):
    selector = spec.get("selector", {})
    if name in {"rgb_color", "rgbw_color", "rgbww_color"}:
        length = {"rgb_color": 3, "rgbw_color": 4, "rgbww_color": 5}[name]
        schema = {"type": "array", "minItems": length, "maxItems": length, "items": {"type": "integer", "minimum": 0, "maximum": 255}}
    elif name in {"hs_color", "xy_color"}:
        limits = (360, 100) if name == "hs_color" else (1, 1)
        schema = {"type": "array", "minItems": 2, "maxItems": 2, "prefixItems": [{"type": "number", "minimum": 0, "maximum": limit} for limit in limits], "items": False}
    elif "number" in selector:
        n = selector["number"] or {}
        schema = {"type": "number"}
        for key, target in (("min", "minimum"), ("max", "maximum")):
            if key in n:
                schema[target] = n[key]
    elif "boolean" in selector:
        schema = {"type": "boolean"}
    elif "constant" in selector:
        schema = {"const": selector["constant"]["value"]}
    elif name == "color_temp_kelvin":
        n = selector.get("color_temp") or {}
        schema = {"type": "number", "minimum": spec.get("device_min") or n.get("min", 2000), "maximum": spec.get("device_max") or n.get("max", 6500)}
    elif "actual_options" in spec or "select" in selector:
        options = spec.get("actual_options", (selector.get("select") or {}).get("options", []))
        options = [x for x in options if fold(str(x)) != "homeassistant"]
        if not options:
            return None
        schema = {"type": "string", "enum": options}
    elif "text" in selector:
        return None  # Unbounded provider-specific settings cannot widen the approved catalog.
    else:
        return None
    if "default" in spec:
        schema["default"] = spec["default"]
    schema["description"] = PARAMETERS[name][1]
    return schema


def parameters_for(fields, attrs, features):
    schema = {"type": "object", "properties": {}, "additionalProperties": False}
    mapping, requirements, required = {}, {}, []
    modes = attrs.get("supported_color_modes", [])
    modes = modes if isinstance(modes, list) else []
    feature_mask = int(attrs.get("supported_features") or 0)
    parameter_modes = {
        "rgb_color": {"hs", "xy", "rgb", "rgbw", "rgbww"},
        "hs_color": {"hs", "xy", "rgb", "rgbw", "rgbww"},
        "xy_color": {"hs", "xy", "rgb", "rgbw", "rgbww"},
        "color_name": {"hs", "xy", "rgb", "rgbw", "rgbww"},
        "rgbw_color": {"rgbw"}, "rgbww_color": {"rgbww"},
        "color_temp_kelvin": {"color_temp"}, "white": {"white"},
        **{key: {"brightness", "color_temp", "hs", "xy", "rgb", "rgbw", "rgbww", "white"}
           for key in ("brightness_pct", "brightness_step_pct", "brightness", "brightness_step")},
    }
    parameter_features = {"transition": features.get("TRANSITION", 32), "effect": features.get("EFFECT", 4), "flash": features.get("FLASH", 8)}
    for backend, spec in fields.items():
        if backend not in PARAMETERS:
            continue
        candidate = parameter_schema(backend, spec)
        if candidate is None:
            continue
        compatible_modes = [mode for mode in modes if mode in parameter_modes.get(backend, set())]
        if backend in parameter_modes and not compatible_modes:
            continue
        if backend in parameter_features and not feature_mask & parameter_features[backend]:
            continue
        key = PARAMETERS[backend][0]
        schema["properties"][key] = candidate
        mapping[key] = backend
        if spec.get("required"):
            required.append(key)
        requirement = {}
        if backend in parameter_modes:
            requirement["color_modes"] = compatible_modes
        if backend in parameter_features:
            requirement["feature"] = parameter_features[backend]
        if requirement:
            requirements[key] = requirement
    if required:
        schema["required"] = required
    return schema, mapping, requirements


def render_value(value, reading):
    if value is None:
        return "nezjištěno"
    if isinstance(value, bool):
        return "ano" if value else "ne"
    if isinstance(value, str):
        value = reading.get("value_map", {}).get(value, value)
    if reading["attribute"] in {"supported_color_modes", "color_mode"}:
        value = public_mode(value)
    return neutral(value)


def public_view(device, states):
    current, available_entities = [], []
    for entity in device["entities"]:
        state = states.get(entity["entity_id"])
        if not entity["disabled"] and state and state.get("state") != "unavailable":
            available_entities.append(entity["entity_id"])
    for reading in device["readings"]:
        state = states.get(reading["entity_id"], {})
        val = state.get("state") if reading["attribute"] == "state" else state.get("attributes", {}).get(reading["attribute"])
        if reading["entity_id"] not in available_entities:
            val = "unavailable"
        current.append({"function": reading["id"], "label": reading["label"], "value": render_value(val, reading), **({"unit": reading["unit"]} if reading["unit"] else {})})
    public = {
        "name": device["name"], "location": device["location"], "kind": device["kind"],
        "controls": [{"function": c["id"], "label": c["label"], "parameters": c["parameters"], "supported": c["supported"], **({"unavailable_reason": c["unavailable_reason"]} if not c["supported"] else {})} for c in device["controls"]],
        "readings": [{"function": r["id"], "label": r["label"], **({"unit": r["unit"]} if r["unit"] else {})} for r in device["readings"]],
        "current_state": current, "possible_states": device["possible_states"],
        "availability": {"available": bool(available_entities), "reason": "dostupné" if available_entities else "momentálně nedostupné"},
    }
    return neutral(public)


def compile_catalog(source, inventory, registries, metadata, states_payload):
    rows = workbook_rows(source)
    entity_rows = {r[2]: r for r in inventory["entities"]}
    registry_entities = {r["entity_id"]: r for r in registries["entities"]}
    state_records = states_payload["states"] if isinstance(states_payload, dict) else states_payload
    states = {s["entity_id"]: s for s in state_records}
    action_rows = collections.defaultdict(list)
    for action in inventory["actions"]:
        action_rows[action[0]].append(action)
    devices, ignored = [], 0
    for source_row, cells in rows:
        if fold(cells.get("D", "").strip()) in {"ignoruj", "ignor", "ignore"}:
            ignored += 1
            continue
        if not cells.get("D", "").strip() or not cells.get("R"):
            raise ValueError(f"Undecided device at workbook row {source_row}")
        allowed_services = {x.strip() for x in cells.get("E", "").split(";") if re.fullmatch(r"[a-z_]+\.[a-z_]+", x.strip())}
        allowed_properties = {x.strip() for x in cells.get("F", "").split(";")}
        eids = cells.get("V", "").splitlines()
        if len(eids) != len(set(eids)):
            raise ValueError("Duplicate entity mapping")
        device = {"row": len(devices) + 1, "name": cells["A"], "location": cells.get("B", ""), "kind": cells["D"], "device_id": cells["R"], "controls": [], "readings": [], "entities": [], "possible_states": [], "camera_entity_id": None}
        for eid in eids:
            row = entity_rows.get(eid)
            if row is None or row[0] != cells["R"]:
                raise ValueError(f"Unresolved entity mapping at row {source_row}")
            registry = registry_entities.get(eid, {})
            domain = eid.split(".")[0]
            attrs = {**json.loads(row[15] or "{}"), **json.loads(row[14] or "{}"), **states.get(eid, {}).get("attributes", {})}
            label = row[3] or cells["A"]
            neutral(label)
            disabled = bool(registry.get("disabled_by"))
            device["entities"].append({"entity_id": eid, "label": label, "domain": domain, "disabled": disabled})
            if domain == "camera" and "camera.snapshot" in allowed_services:
                if device["camera_entity_id"]:
                    raise ValueError("Multiple cameras require explicit mapping")
                device["camera_entity_id"] = eid
            klass = row[6] or attrs.get("device_class", "")
            values = state_labels(domain, klass)
            for attribute in ["state"] + sorted(k for k in attrs if k != "state"):
                if attribute not in allowed_properties or attribute in INTERNAL_ATTRIBUTES or SECRET.search(attribute):
                    continue
                if attribute not in ATTRIBUTE_LABELS:
                    raise ValueError(f"Attribute requires a neutral label: {attribute}")
                reading = {"id": f"r{len(device['readings'])+1:02}", "label": label + ": " + ATTRIBUTE_LABELS[attribute], "entity_id": eid, "attribute": attribute, "unit": (row[10] or attrs.get("unit_of_measurement", "")) if attribute == "state" else "K" if "kelvin" in attribute else "", "value_map": values if attribute == "state" else {**MODE_LABELS, "unavailable": "nedostupné", "unknown": "stav neznámý"}}
                device["readings"].append(reading)
            possible = {"label": label}
            if domain in {"light", "switch", "siren", "binary_sensor"}:
                possible["states"] = [values["on"], values["off"]]
            if attrs.get("options"):
                possible["options"] = neutral(attrs["options"])
            if attrs.get("supported_color_modes"):
                possible["capabilities"] = public_mode(attrs["supported_color_modes"])
                ranges = []
                if any(mode in {"brightness", "color_temp", "hs", "xy", "rgb", "rgbw", "rgbww", "white"} for mode in attrs["supported_color_modes"]):
                    ranges.append({"label": "Jas", "min": 0, "max": 100, "unit": "%"})
                if "color_temp" in attrs["supported_color_modes"] and attrs.get("min_color_temp_kelvin") and attrs.get("max_color_temp_kelvin"):
                    ranges.append({"label": "Teplota bílé", "min": attrs["min_color_temp_kelvin"], "max": attrs["max_color_temp_kelvin"], "unit": "K"})
                if ranges:
                    possible["ranges"] = ranges
            if attrs.get("event_types"):
                possible["events"] = neutral(attrs["event_types"])
            if len(possible) > 1:
                device["possible_states"].append(possible)
        for action in sorted(action_rows[cells["R"]], key=lambda a: (a[2], a[4])):
            eid, service = action[2], action[4]
            if service not in allowed_services or eid not in eids:
                continue
            domain, operation = service.split(".")
            if operation not in SERVICE_LABELS or domain not in {"light", "switch", "select", "siren", "button", "camera"}:
                raise ValueError("Unsupported approved service")
            row = entity_rows[eid]
            attrs = {**json.loads(row[15] or "{}"), **json.loads(row[14] or "{}"), **states.get(eid, {}).get("attributes", {})}
            schema, mapping, requirements = parameters_for(json.loads(action[6]), attrs, metadata["features"].get(domain, {}))
            supported, reason = True, ""
            if domain == "camera" and operation == "play_stream":
                supported, reason = False, "Chybí schválený přehrávač živého obrazu."
            elif domain == "camera" and operation == "record":
                schema["properties"]["duration_sec"] = {"type": "integer", "minimum": 1, "maximum": 300, "default": 30, "description": "Délka záznamu v sekundách"}
                schema["properties"]["lookback_sec"] = {"type": "integer", "minimum": 0, "maximum": 30, "default": 0, "description": "Délka předzáznamu v sekundách"}
            elif domain == "camera" and operation in {"enable_motion_detection", "disable_motion_detection"}:
                # The installed adapter implements both methods. A companion motion
                # alarm entity demonstrates that this particular device has the DP.
                if not any("pohybovy alarm" in fold(entity_rows[x][3]) for x in eids if x.startswith("switch.")):
                    supported, reason = False, "Konkrétní ovládání detekce pohybu není potvrzené."
            control = {"id": f"c{len(device['controls'])+1:02}", "label": action[3] + ": " + SERVICE_LABELS[operation], "entity_id": eid, "domain": domain, "service": operation, "parameters": schema, "parameter_map": mapping, "parameter_requirements": requirements, "supported": supported, "unavailable_reason": reason}
            if domain == "camera" and operation == "record":
                control["required_features"] = metadata["features"]["camera"].get("STREAM", 2)
            if operation == "snapshot":
                control["parameters"] = {"type": "object", "properties": {}, "additionalProperties": False}
                control["parameter_map"] = {}
                control["parameter_requirements"] = {}
            device["controls"].append(control)
        mapped_services = {control["domain"] + "." + control["service"] for control in device["controls"]}
        if allowed_services - mapped_services:
            raise ValueError(f"An approved service has no validated target at row {source_row}")
        neutral({"name": device["name"], "location": device["location"], "kind": device["kind"], "possible_states": device["possible_states"]})
        if any(existing["device_id"] == device["device_id"] for existing in devices):
            raise ValueError("Duplicate stable device mapping")
        device["current_state"] = public_view(device, states)["current_state"]
        device["availability"] = public_view(device, states)["availability"]
        devices.append(device)
    identity = [{k: v for k, v in d.items() if k not in {"current_state", "availability"}} for d in devices]
    revision = hashlib.sha256(json.dumps(identity, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:24]
    fetched = states_payload.get("generated_at", "") if isinstance(states_payload, dict) else ""
    private = {"revision": revision, "fields": FIELDS, "devices": devices}
    public = {"revision": revision, "fields": FIELDS, "fetched_at": fetched, "devices": [public_view(d, states) for d in devices]}
    if len(devices) != 199 or ignored != 27:
        raise ValueError("Membership differs from the approved 199-device catalog")
    all_entities = [entity["entity_id"] for device in devices for entity in device["entities"]]
    if len(all_entities) != len(set(all_entities)):
        raise ValueError("An entity is mapped to more than one approved device")
    neutral(public)
    return private, public


def main():
    parser = argparse.ArgumentParser()
    for name in ("source", "inventory", "registries", "metadata", "states", "private", "public"):
        parser.add_argument("--" + name, required=True, type=pathlib.Path)
    args = parser.parse_args()
    private, public = compile_catalog(args.source, json.loads(args.inventory.read_text()), json.loads(args.registries.read_text()), json.loads(args.metadata.read_text()), json.loads(args.states.read_text()))
    for path, payload, permissions in ((args.private, private, 0o600), (args.public, public, 0o644)):
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, permissions)
        os.fchmod(fd, permissions)
        with os.fdopen(fd, "w") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)
            file.write("\n")
    print(json.dumps({"devices": len(private["devices"]), "controls": sum(len(d["controls"]) for d in private["devices"]), "readings": sum(len(d["readings"]) for d in private["devices"]), "revision": private["revision"]}))


if __name__ == "__main__":
    main()
