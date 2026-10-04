"""Provider identity based accounting; missing details are never zero cost."""
from decimal import Decimal


def clean_usage(value, depth=0):
    """Only numeric provider usage fields; no arbitrary response bodies in metadata."""
    if not isinstance(value, dict) or depth > 3:
        return None
    allowed = {"input_tokens", "output_tokens", "total_tokens", "cached_tokens", "text_tokens", "audio_tokens", "image_tokens", "reasoning_tokens", "input_token_details", "output_token_details", "input_tokens_details", "output_tokens_details", "cached_tokens_details"}
    result = {}
    for key, item in value.items():
        if key not in allowed:
            continue
        if isinstance(item, dict):
            result[key] = clean_usage(item, depth+1)
        elif isinstance(item, int) and not isinstance(item, bool) and 0 <= item <= 10**12:
            result[key] = item
    return result


def usage_record(response: dict, model: str):
    usage = clean_usage(response.get("usage"))
    from .pricing import SNAPSHOT
    cost = estimate(usage, SNAPSHOT["models"].get(model, {}))
    return {"price_snapshot": {k:v for k,v in SNAPSHOT.items() if k!="models"}, "cost_estimate":cost, "response_id": response.get("id"), "model": model,
            "status": response.get("status", "unknown"),
            "complete": isinstance(usage, dict) and all(k in usage for k in ("input_tokens", "output_tokens", "total_tokens")),
            "usage": usage if isinstance(usage, dict) else None}


def estimate(usage: dict | None, rates: dict):
    if not usage:
        return {"usd": None, "complete": False, "reason": "missing_usage"}
    total = Decimal(0)
    try:
        inputs, outputs = usage["input_token_details"], usage["output_token_details"]
        cached = inputs["cached_tokens_details"]
        for modality in ("text", "audio", "image"):
            field = modality + "_tokens"
            count, hit = inputs.get(field), cached.get(field)
            if count is None or hit is None:
                raise KeyError(field)
            if not 0 <= hit <= count:
                raise ValueError("cache_count")
            output = outputs.get(field, 0 if modality == "image" else None)
            if output is None:
                raise KeyError(field)
            if count or hit or output:
                rate = rates[modality]
                total += (Decimal(count-hit)*Decimal(str(rate["input"])) + Decimal(hit)*Decimal(str(rate["cached"])) + Decimal(output)*Decimal(str(rate["output"]))) / 1_000_000
        if sum(inputs.get(m + "_tokens", 0) for m in ("text", "audio", "image")) != usage["input_tokens"]:
            raise ValueError("unknown_input_modality")
        if sum(outputs.get(m + "_tokens", 0) for m in ("text", "audio", "image")) != usage["output_tokens"]:
            raise ValueError("unknown_output_modality")
    except (KeyError, ValueError, TypeError):
        return {"usd": None, "complete": False, "reason": "incomplete_modality_or_rate"}
    return {"usd": str(total), "complete": True}
