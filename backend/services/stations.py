from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from db.mysql import get_station_longitude_column, open_tenant_mysql_connection


class StationNotFoundError(Exception):
    pass


def list_sensor_types(tenant: dict[str, Any]) -> list[dict[str, Any]]:
    with open_tenant_mysql_connection(tenant) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, name
                FROM dv_zetaced_sensor_type
                ORDER BY name ASC, id ASC
                """
            )
            rows = cursor.fetchall()

    return [
        {
            "sensor_type_id": int(row["id"]),
            "sensor_name": row["name"] or f"Sensor {row['id']}",
        }
        for row in rows
    ]


def list_stations_with_latest(tenant: dict[str, Any]) -> list[dict[str, Any]]:
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
                    sensor_type.name AS sensor_type_name
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


def get_station_latest(tenant: dict[str, Any], station_id: int) -> dict[str, Any]:
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
                    sensor_type.name AS sensor_type_name
                FROM dv_zetaced_sensor AS sensor
                LEFT JOIN dv_zetaced_sensor_type AS sensor_type
                    ON sensor_type.id = sensor.sensor_id
                WHERE sensor.station_id = %s
                ORDER BY sensor.sensor_id ASC, sensor.id ASC
                """,
                (station_id,),
            )
            sensor_rows = cursor.fetchall()

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
    raw_time: time | str | None,
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
        else:
            parsed_time = raw_time

        return datetime.combine(parsed_date, parsed_time)
    except (TypeError, ValueError):
        return None
