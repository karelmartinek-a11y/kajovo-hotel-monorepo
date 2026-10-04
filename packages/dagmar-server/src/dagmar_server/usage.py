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
    if rates.get("kind") == "text":
        try:
            count, output = usage["input_tokens"], usage["output_tokens"]
            cached = usage["input_tokens_details"]["cached_tokens"]
            if not 0 <= cached <= count or output < 0:
                raise ValueError("cache_count")
            rate = rates["text"]
            total = (Decimal(count-cached)*Decimal(str(rate["input"])) + Decimal(cached)*Decimal(str(rate["cached"])) + Decimal(output)*Decimal(str(rate["output"]))) / 1_000_000
            return {"usd":str(total), "complete":True}
        except (KeyError, ValueError, TypeError):
            return {"usd":None, "complete":False, "reason":"missing_text_or_cache_usage"}
    try:
        inputs, outputs = usage["input_token_details"], usage["output_token_details"]
        cached = inputs.get("cached_tokens_details") or ({} if inputs.get("cached_tokens") == 0 else None)
        if cached is None:
            raise KeyError("cached_tokens_details")
        for modality in ("text", "audio", "image"):
            field = modality + "_tokens"
            count = inputs.get(field)
            if modality == "image" and count is None and sum(inputs.get(m + "_tokens", 0) for m in ("text", "audio")) == usage["input_tokens"]:
                count = 0
            hit = cached.get(field, 0 if inputs.get("cached_tokens") == 0 or count == 0 else None)
            if count is None or hit is None:
                raise KeyError(field)
            if not 0 <= hit <= count:
                raise ValueError("cache_count")
            output = outputs.get(field, 0 if modality == "image" and sum(outputs.get(m + "_tokens", 0) for m in ("text", "audio")) == usage["output_tokens"] else None)
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
