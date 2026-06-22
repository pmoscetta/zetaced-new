from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any

from db.mysql import open_tenant_mysql_connection
from schemas.data import DataQueryParams


def get_aligned_data(
    tenant: dict[str, Any],
    params: DataQueryParams,
) -> dict[str, Any]:
    raw_rows = _fetch_raw_rows(tenant, params)
    columns = _extract_columns(raw_rows)
    rows = _align_rows(raw_rows, params.alignment_seconds)

    return {
        "columns": columns,
        "rows": rows,
    }


def get_chart_data(
    tenant: dict[str, Any],
    params: DataQueryParams,
) -> dict[str, Any]:
    raw_rows = _fetch_raw_rows(tenant, params)
    series_map: dict[str, dict[str, Any]] = {}

    for row in raw_rows:
        sensor_type_id = row.get("sensor_type_id")
        station_id = row.get("station_id")
        recorded_at = row.get("recorded_at")
        value = _to_float(row.get("value"))
        if (
            sensor_type_id is None
            or station_id is None
            or recorded_at is None
            or value is None
        ):
            continue

        station_id_int = int(station_id)
        sensor_type_id_int = int(sensor_type_id)
        sensor_name = (
            row.get("sensor_label")
            or row.get("sensor_type_name")
            or f"Sensor {sensor_type_id_int}"
        )
        series_key = f"{station_id_int}:{sensor_type_id_int}"
        series = series_map.setdefault(
            series_key,
            {
                "series_key": series_key,
                "station_id": station_id_int,
                "station_name": row.get("station_name") or f"Station {station_id_int}",
                "sensor_type_id": sensor_type_id_int,
                "sensor_name": sensor_name,
                "points": [],
            },
        )
        series["points"].append(
            {
                "timestamp": recorded_at,
                "value": value,
            }
        )

    for series in series_map.values():
        series["points"].sort(key=lambda point: point["timestamp"])

    return {
        "series": list(series_map.values()),
    }


def _fetch_raw_rows(
    tenant: dict[str, Any],
    params: DataQueryParams,
) -> list[dict[str, Any]]:
    with open_tenant_mysql_connection(tenant) as connection:
        sensor_map = _fetch_sensor_instances(connection, params)
        if not sensor_map:
            return []

        sensor_instance_ids = sorted(sensor_map)
        placeholders = ", ".join(["%s"] * len(sensor_instance_ids))
        sql = f"""
            SELECT sensor_id, rdate, rtime, value
            FROM dv_zetaced_data
            WHERE rdate <> '0000-00-00'
              AND rtime <> '00:00:00'
              AND sensor_id IN ({placeholders})
        """
        query_params: list[Any] = list(sensor_instance_ids)

        if params.date_from:
            sql += " AND rdate >= %s"
            query_params.append(params.date_from.date())

        if params.date_to:
            sql += " AND rdate <= %s"
            query_params.append(params.date_to.date())

        sql += " ORDER BY rdate ASC, rtime ASC, sensor_id ASC"

        with connection.cursor() as cursor:
            cursor.execute(sql, query_params)
            data_rows = cursor.fetchall()

    enriched_rows: list[dict[str, Any]] = []
    for row in data_rows:
        recorded_at = _parse_recorded_at(row.get("rdate"), row.get("rtime"))
        if recorded_at is None:
            continue

        if params.date_from and recorded_at < params.date_from.replace(tzinfo=None):
            continue

        if params.date_to and recorded_at > params.date_to.replace(tzinfo=None):
            continue

        sensor_instance_id = row.get("sensor_id")
        if sensor_instance_id is None:
            continue

        sensor_metadata = sensor_map.get(int(sensor_instance_id))
        if not sensor_metadata:
            continue

        enriched_rows.append(
            {
                **sensor_metadata,
                "value": row.get("value"),
                "recorded_at": recorded_at,
            }
        )

    return enriched_rows


def _fetch_sensor_instances(
    connection: Any,
    params: DataQueryParams,
) -> dict[int, dict[str, Any]]:
    sql = """
        SELECT
            sensor.id AS sensor_instance_id,
            sensor.station_id,
            station.name AS station_name,
            sensor.sensor_id AS sensor_type_id,
            sensor.name AS sensor_label,
            sensor_type.name AS sensor_type_name
        FROM dv_zetaced_sensor AS sensor
        LEFT JOIN dv_zetaced_station AS station
            ON station.id = sensor.station_id
        LEFT JOIN dv_zetaced_sensor_type AS sensor_type
            ON sensor_type.id = sensor.sensor_id
        WHERE 1 = 1
    """
    query_params: list[Any] = []

    if params.station_ids:
        placeholders = ", ".join(["%s"] * len(params.station_ids))
        sql += f" AND sensor.station_id IN ({placeholders})"
        query_params.extend(params.station_ids)

    if params.sensor_ids:
        placeholders = ", ".join(["%s"] * len(params.sensor_ids))
        sql += f" AND sensor.sensor_id IN ({placeholders})"
        query_params.extend(params.sensor_ids)

    sql += " ORDER BY sensor.station_id ASC, sensor.sensor_id ASC, sensor.id ASC"

    with connection.cursor() as cursor:
        cursor.execute(sql, query_params)
        sensor_rows = cursor.fetchall()

    return {
        int(row["sensor_instance_id"]): {
            "station_id": int(row["station_id"]),
            "station_name": row.get("station_name")
            or f"Station {row['station_id']}",
            "sensor_instance_id": int(row["sensor_instance_id"]),
            "sensor_type_id": int(row["sensor_type_id"]),
            "sensor_label": row.get("sensor_label"),
            "sensor_type_name": row.get("sensor_type_name"),
        }
        for row in sensor_rows
        if row.get("sensor_instance_id") is not None
        and row.get("station_id") is not None
        and row.get("sensor_type_id") is not None
    }


def _extract_columns(raw_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    column_map: dict[int, dict[str, Any]] = {}

    for row in raw_rows:
        sensor_type_id = row.get("sensor_type_id")
        if sensor_type_id is None:
            continue

        sensor_type_id_int = int(sensor_type_id)
        if sensor_type_id_int in column_map:
            continue

        sensor_name = (
            row.get("sensor_label")
            or row.get("sensor_type_name")
            or f"Sensor {sensor_type_id_int}"
        )
        column_map[sensor_type_id_int] = {
            "sensor_type_id": sensor_type_id_int,
            "sensor_name": sensor_name,
        }

    return [column_map[key] for key in sorted(column_map)]


@dataclass
class _AlignedRow:
    timestamp: datetime
    station_id: int
    station_name: str
    values: dict[str, float | None] = field(default_factory=dict)


def _align_rows(
    raw_rows: list[dict[str, Any]],
    alignment_seconds: int,
) -> list[dict[str, Any]]:
    grouped_rows: dict[int, list[_AlignedRow]] = defaultdict(list)

    for raw_row in raw_rows:
        recorded_at = raw_row.get("recorded_at")
        station_id = raw_row.get("station_id")
        sensor_type_id = raw_row.get("sensor_type_id")
        if recorded_at is None or station_id is None or sensor_type_id is None:
            continue

        station_id_int = int(station_id)
        sensor_key = str(int(sensor_type_id))
        station_rows = grouped_rows[station_id_int]
        target_row = None

        for candidate in reversed(station_rows):
            delta_seconds = abs((recorded_at - candidate.timestamp).total_seconds())
            if delta_seconds > alignment_seconds:
                break
            if sensor_key not in candidate.values:
                target_row = candidate
                break

        if target_row is None:
            target_row = _AlignedRow(
                timestamp=recorded_at,
                station_id=station_id_int,
                station_name=raw_row.get("station_name")
                or f"Station {station_id_int}",
            )
            station_rows.append(target_row)

        target_row.values[sensor_key] = _to_float(raw_row.get("value"))

    flattened_rows = [
        {
            "timestamp": aligned_row.timestamp,
            "station_id": aligned_row.station_id,
            "station_name": aligned_row.station_name,
            "values": aligned_row.values,
        }
        for station_rows in grouped_rows.values()
        for aligned_row in station_rows
    ]

    flattened_rows.sort(key=lambda row: (row["station_id"], row["timestamp"]))
    return flattened_rows


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


def _parse_recorded_at(
    raw_date: datetime | str | None,
    raw_time: datetime | str | None,
) -> datetime | None:
    if raw_date in (None, "0000-00-00") or raw_time in (None, "00:00:00"):
        return None

    try:
        return datetime.strptime(f"{raw_date} {raw_time}", "%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        return None
