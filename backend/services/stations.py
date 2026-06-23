from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from db.mysql import get_station_longitude_column, open_tenant_mysql_connection


class StationNotFoundError(Exception):
    pass


VISIBILITY_FIELDS = {
    "map": "visible_on_map",
    "monitor": "visible_on_monitor",
    "results": "visible_on_results",
}


def list_sensor_types(
    tenant: dict[str, Any],
    user_level: int,
    visibility_mode: str = "results",
) -> list[dict[str, Any]]:
    visibility_field = _get_visibility_field(visibility_mode)

    with open_tenant_mysql_connection(tenant) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    sensor.sensor_id AS sensor_type_id,
                    sensor.name AS sensor_label,
                    sensor_type.name AS sensor_type_name,
                    sensor.visible_on_map,
                    sensor.visible_on_monitor,
                    sensor.visible_on_results
                FROM dv_zetaced_sensor AS sensor
                LEFT JOIN dv_zetaced_sensor_type AS sensor_type
                    ON sensor_type.id = sensor.sensor_id
                ORDER BY sensor.sensor_id ASC, sensor.id ASC
                """
            )
            rows = cursor.fetchall()

    sensors: list[dict[str, Any]] = []
    seen_sensor_type_ids: set[int] = set()

    for row in rows:
        sensor_type_id = row.get("sensor_type_id")
        if sensor_type_id is None:
            continue

        sensor_type_id_int = int(sensor_type_id)
        if sensor_type_id_int in seen_sensor_type_ids:
            continue

        if not _is_visible_for_level(row.get(visibility_field), user_level):
            continue

        seen_sensor_type_ids.add(sensor_type_id_int)
        sensors.append(
            {
                "sensor_type_id": sensor_type_id_int,
                "sensor_name": row.get("sensor_label")
                or row.get("sensor_type_name")
                or f"Sensor {sensor_type_id_int}",
            }
        )

    return sensors


def list_stations_with_latest(
    tenant: dict[str, Any],
    user_level: int,
    visibility_mode: str = "monitor",
) -> list[dict[str, Any]]:
    visibility_field = _get_visibility_field(visibility_mode)

    with open_tenant_mysql_connection(tenant) as connection:
        longitude_column = get_station_longitude_column(connection)

        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT id, name, latitude, `{longitude_column}` AS longitude
                FROM dv_zetaced_station
                ORDER BY name ASC, id ASC
                """
            )
            station_rows = cursor.fetchall()

            cursor.execute(
                """
                SELECT
                    sensor.id,
                    sensor.station_id,
                    sensor.sensor_id AS sensor_type_id,
                    sensor.name AS sensor_label,
                    sensor.last_value,
                    sensor.last_value_date,
                    sensor.last_value_time,
                    sensor_type.name AS sensor_type_name,
                    sensor.visible_on_map,
                    sensor.visible_on_monitor,
                    sensor.visible_on_results
                FROM dv_zetaced_sensor AS sensor
                LEFT JOIN dv_zetaced_sensor_type AS sensor_type
                    ON sensor_type.id = sensor.sensor_id
                ORDER BY sensor.station_id ASC, sensor.sensor_id ASC, sensor.id ASC
                """
            )
            sensor_rows = cursor.fetchall()

    station_map = {
        int(row["id"]): {
            "station_id": int(row["id"]),
            "station_name": row["name"] or f"Station {row['id']}",
            "latitude": _to_float(row.get("latitude")),
            "longitude": _to_float(row.get("longitude")),
            "latest_update": None,
            "sensors": [],
        }
        for row in station_rows
    }

    for row in sensor_rows:
        if not _is_visible_for_level(row.get(visibility_field), user_level):
            continue

        station_id = int(row["station_id"])
        station = station_map.setdefault(
            station_id,
            {
                "station_id": station_id,
                "station_name": f"Station {station_id}",
                "latitude": None,
                "longitude": None,
                "latest_update": None,
                "sensors": [],
            },
        )

        sensor_payload = _build_sensor_payload(row)
        station["sensors"].append(sensor_payload)
        station["latest_update"] = _pick_latest_timestamp(
            station["latest_update"],
            sensor_payload["last_update"],
        )

    return list(station_map.values())


def get_station_latest(
    tenant: dict[str, Any],
    station_id: int,
    user_level: int,
    visibility_mode: str = "monitor",
) -> dict[str, Any]:
    visibility_field = _get_visibility_field(visibility_mode)

    with open_tenant_mysql_connection(tenant) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, name
                FROM dv_zetaced_station
                WHERE id = %s
                LIMIT 1
                """,
                (station_id,),
            )
            station_row = cursor.fetchone()

            if not station_row:
                raise StationNotFoundError()

            cursor.execute(
                """
                SELECT
                    sensor.id,
                    sensor.station_id,
                    sensor.sensor_id AS sensor_type_id,
                    sensor.name AS sensor_label,
                    sensor.last_value,
                    sensor.last_value_date,
                    sensor.last_value_time,
                    sensor_type.name AS sensor_type_name,
                    sensor.visible_on_map,
                    sensor.visible_on_monitor,
                    sensor.visible_on_results
                FROM dv_zetaced_sensor AS sensor
                LEFT JOIN dv_zetaced_sensor_type AS sensor_type
                    ON sensor_type.id = sensor.sensor_id
                WHERE sensor.station_id = %s
                ORDER BY sensor.sensor_id ASC, sensor.id ASC
                """,
                (station_id,),
            )
            sensor_rows = [
                row
                for row in cursor.fetchall()
                if _is_visible_for_level(row.get(visibility_field), user_level)
            ]

    sensors = [_build_sensor_payload(row) for row in sensor_rows]
    latest_update = None
    for sensor in sensors:
        latest_update = _pick_latest_timestamp(latest_update, sensor["last_update"])

    return {
        "station_id": int(station_row["id"]),
        "station_name": station_row["name"] or f"Station {station_row['id']}",
        "latest_update": latest_update,
        "sensors": sensors,
    }


def _build_sensor_payload(row: dict[str, Any]) -> dict[str, Any]:
    sensor_type_id = row.get("sensor_type_id")
    sensor_name = (
        row.get("sensor_label")
        or row.get("sensor_type_name")
        or (
            f"Sensor {sensor_type_id}"
            if sensor_type_id is not None
            else "Unknown sensor"
        )
    )

    return {
        "sensor_id": int(row["id"]) if row.get("id") is not None else None,
        "sensor_type_id": int(sensor_type_id) if sensor_type_id is not None else None,
        "sensor_name": sensor_name,
        "last_value": _to_float(row.get("last_value")),
        "last_update": _combine_legacy_timestamp(
            row.get("last_value_date"),
            row.get("last_value_time"),
        ),
    }


def _to_float(value: Any) -> float | None:
    if value is None:
        return None

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, (int, float)):
        return float(value)

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _get_visibility_field(visibility_mode: str) -> str:
    if visibility_mode not in VISIBILITY_FIELDS:
        raise ValueError(f"Unsupported visibility mode: {visibility_mode}")

    return VISIBILITY_FIELDS[visibility_mode]


def _is_visible_for_level(raw_threshold: Any, user_level: int) -> bool:
    threshold = _to_int(raw_threshold)
    if threshold is None:
        threshold = 1

    return user_level >= threshold


def _to_int(value: Any) -> int | None:
    if value is None:
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _pick_latest_timestamp(
    current: datetime | None,
    candidate: datetime | None,
) -> datetime | None:
    if current is None:
        return candidate

    if candidate is None:
        return current

    return candidate if candidate > current else current


def _combine_legacy_timestamp(
    raw_date: date | str | None,
    raw_time: time | str | timedelta | None,
) -> datetime | None:
    if raw_date in (None, "0000-00-00") or raw_time in (None, "00:00:00"):
        return None

    try:
        if isinstance(raw_date, str):
            parsed_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
        else:
            parsed_date = raw_date

        if isinstance(raw_time, str):
            parsed_time = datetime.strptime(raw_time, "%H:%M:%S").time()
        elif isinstance(raw_time, timedelta):
            total_seconds = int(raw_time.total_seconds())
            hours = (total_seconds // 3600) % 24
            minutes = (total_seconds % 3600) // 60
            seconds = total_seconds % 60
            parsed_time = time(hour=hours, minute=minutes, second=seconds)
        else:
            parsed_time = raw_time

        return datetime.combine(parsed_date, parsed_time)
    except (TypeError, ValueError):
        return None
