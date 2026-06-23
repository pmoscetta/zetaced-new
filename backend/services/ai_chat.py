import json
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from config import settings
from services.stations import list_sensor_types, list_stations_with_latest

REQUEST_TIMEOUT_SECONDS = 30
_JSON_BLOCK_PATTERN = re.compile(r"\{.*\}", re.DOTALL)


class ChatConfigurationError(Exception):
    pass


class ChatUpstreamError(Exception):
    pass


def generate_chat_reply(
    tenant: dict[str, Any],
    user_level: int,
    message: str,
    current_page: str,
) -> dict[str, Any]:
    if not settings.openrouter_api_key:
        raise ChatConfigurationError("OpenRouter API key is not configured.")

    catalog = _build_catalog(tenant, user_level)
    system_prompt = _build_system_prompt(catalog, current_page)

    payload = {
        "model": settings.openrouter_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://zetaced.systea.cloud",
        "X-Title": "Zetaced Monitoring",
    }

    try:
        response = httpx.post(
            f"{settings.openrouter_base_url.rstrip('/')}/chat/completions",
            headers=headers,
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        body = response.json()
    except httpx.HTTPStatusError as exc:
        raise ChatUpstreamError(
            f"OpenRouter returned status {exc.response.status_code}."
        ) from exc
    except httpx.HTTPError as exc:
        raise ChatUpstreamError("Unable to reach the OpenRouter service.") from exc

    content = _extract_message_content(body)
    return _parse_model_output(content, catalog)


def _build_catalog(tenant: dict[str, Any], user_level: int) -> dict[str, Any]:
    stations = list_stations_with_latest(tenant, user_level, "results")
    sensors = list_sensor_types(tenant, user_level, "results")

    return {
        "stations": [
            {
                "id": station["station_id"],
                "name": station["station_name"],
            }
            for station in stations
        ],
        "sensors": [
            {
                "id": sensor["sensor_type_id"],
                "name": sensor["sensor_name"],
            }
            for sensor in sensors
        ],
    }


def _build_system_prompt(catalog: dict[str, Any], current_page: str) -> str:
    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    stations_json = json.dumps(catalog["stations"], ensure_ascii=False)
    sensors_json = json.dumps(catalog["sensors"], ensure_ascii=False)

    return (
        "You are the assistant for the Zetaced environmental monitoring platform. "
        "You help users filter monitoring data. You understand both English and Italian "
        "and reply in the same language the user used.\n\n"
        f"The current UTC datetime is {now_iso}.\n"
        f"The user is currently on the '{current_page}' page.\n\n"
        "Available stations (id and name):\n"
        f"{stations_json}\n\n"
        "Available sensor types (id and name):\n"
        f"{sensors_json}\n\n"
        "When the user asks to view, filter, chart or export data, map the station and "
        "sensor names they mention to the matching ids from the catalog above. Resolve "
        "relative time phrases (for example 'last 7 days', 'ultimo mese', 'yesterday') into "
        "absolute ISO 8601 datetimes based on the current datetime.\n\n"
        "You MUST respond with a single JSON object and nothing else, using this exact shape:\n"
        "{\n"
        '  "reply": "a short natural language answer in the user language",\n'
        '  "filters": {\n'
        '    "station_ids": [int, ...],\n'
        '    "sensor_ids": [int, ...],\n'
        '    "date_from": "ISO 8601 datetime or null",\n'
        '    "date_to": "ISO 8601 datetime or null",\n'
        '    "alignment_seconds": int or null\n'
        "  }\n"
        "}\n\n"
        "Set \"filters\" to null when the user is only asking a general question and does not "
        "want to change the current data filters. Only include station_ids or sensor_ids that "
        "actually exist in the catalog. Never invent ids."
    )


def _extract_message_content(body: dict[str, Any]) -> str:
    choices = body.get("choices") or []
    if not choices:
        raise ChatUpstreamError("OpenRouter response did not contain any choices.")

    message = choices[0].get("message") or {}
    content = message.get("content")

    if isinstance(content, list):
        content = "".join(
            part.get("text", "")
            for part in content
            if isinstance(part, dict)
        )

    if not isinstance(content, str) or not content.strip():
        raise ChatUpstreamError("OpenRouter response was empty.")

    return content


def _parse_model_output(content: str, catalog: dict[str, Any]) -> dict[str, Any]:
    parsed = _safe_json_loads(content)

    if not isinstance(parsed, dict):
        return {"reply": content.strip(), "filters": None}

    reply = parsed.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        reply = content.strip()

    filters = _sanitize_filters(parsed.get("filters"), catalog)

    return {"reply": reply.strip(), "filters": filters}


def _safe_json_loads(content: str) -> Any:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = _JSON_BLOCK_PATTERN.search(content)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


def _sanitize_filters(
    raw_filters: Any,
    catalog: dict[str, Any],
) -> dict[str, Any] | None:
    if not isinstance(raw_filters, dict):
        return None

    valid_station_ids = {station["id"] for station in catalog["stations"]}
    valid_sensor_ids = {sensor["id"] for sensor in catalog["sensors"]}

    station_ids = _filter_ids(raw_filters.get("station_ids"), valid_station_ids)
    sensor_ids = _filter_ids(raw_filters.get("sensor_ids"), valid_sensor_ids)
    date_from = _parse_iso_datetime(raw_filters.get("date_from"))
    date_to = _parse_iso_datetime(raw_filters.get("date_to"))
    alignment_seconds = _coerce_alignment(raw_filters.get("alignment_seconds"))

    has_content = (
        station_ids
        or sensor_ids
        or date_from is not None
        or date_to is not None
        or alignment_seconds is not None
    )
    if not has_content:
        return None

    return {
        "station_ids": station_ids,
        "sensor_ids": sensor_ids,
        "date_from": date_from,
        "date_to": date_to,
        "alignment_seconds": alignment_seconds,
    }


def _filter_ids(raw_ids: Any, valid_ids: set[int]) -> list[int]:
    if not isinstance(raw_ids, list):
        return []

    result: list[int] = []
    for candidate in raw_ids:
        try:
            candidate_int = int(candidate)
        except (TypeError, ValueError):
            continue
        if candidate_int in valid_ids and candidate_int not in result:
            result.append(candidate_int)

    return result


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None

    candidate = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(candidate)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(value.strip(), fmt)
            except ValueError:
                continue
    return None


def _coerce_alignment(value: Any) -> int | None:
    if value is None:
        return None

    try:
        seconds = int(value)
    except (TypeError, ValueError):
        return None

    if seconds < 0:
        return 0
    if seconds > 3600:
        return 3600
    return seconds
