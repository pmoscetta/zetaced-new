from datetime import date, datetime, time, timedelta
from typing import Any

from db.mysql import open_tenant_mysql_connection

ALARM_TABLE = "dv_zetaced_message"
DEFAULT_LIMIT = 50

_MESSAGE_COLUMN_CANDIDATES = ("rtext", "message", "text", "msg", "description")
_TIMESTAMP_COLUMN_CANDIDATES = ("timestamp", "rdatetime", "datetime", "created_at")
_DATE_COLUMN_CANDIDATES = ("rdate", "date")
_TIME_COLUMN_CANDIDATES = ("rtime", "time")
_ID_COLUMN_CANDIDATES = ("id", "message_id")

_ALARM_KEYWORDS = ("alarm", "allarme", "alert", "critical", "critico", "fault", "guasto", "error", "errore")
_WARNING_KEYWORDS = ("warning", "warn", "attenzione", "avviso", "low", "high")


def list_alarms(
    tenant: dict[str, Any],
    limit: int = DEFAULT_LIMIT,
) -> list[dict[str, Any]]:
    with open_tenant_mysql_connection(tenant) as connection:
        columns = _get_table_columns(connection, ALARM_TABLE)

        id_column = _pick_column(columns, _ID_COLUMN_CANDIDATES)
        message_column = _pick_column(columns, _MESSAGE_COLUMN_CANDIDATES)
        timestamp_column = _pick_column(columns, _TIMESTAMP_COLUMN_CANDIDATES)
        date_column = _pick_column(columns, _DATE_COLUMN_CANDIDATES)
        time_column = _pick_column(columns, _TIME_COLUMN_CANDIDATES)

        select_parts: list[str] = []
        if id_column:
            select_parts.append(f"`{id_column}` AS alarm_id")
        if message_column:
            select_parts.append(f"`{message_column}` AS alarm_message")
        if timestamp_column:
            select_parts.append(f"`{timestamp_column}` AS alarm_timestamp")
        if date_column:
            select_parts.append(f"`{date_column}` AS alarm_date")
        if time_column:
            select_parts.append(f"`{time_column}` AS alarm_time")

        if not select_parts:
            select_parts.append("*")

        order_clause = _build_order_clause(
            timestamp_column=timestamp_column,
            date_column=date_column,
            time_column=time_column,
            id_column=id_column,
        )

        sql = f"SELECT {', '.join(select_parts)} FROM `{ALARM_TABLE}`{order_clause} LIMIT %s"

        with connection.cursor() as cursor:
            cursor.execute(sql, (limit,))
            rows = cursor.fetchall()

    alarms: list[dict[str, Any]] = []
    for row in rows:
        message = _stringify(row.get("alarm_message"))
        recorded_at = _resolve_timestamp(
            row.get("alarm_timestamp"),
            row.get("alarm_date"),
            row.get("alarm_time"),
        )

        alarms.append(
            {
                "id": _to_int(row.get("alarm_id")),
                "timestamp": recorded_at,
                "date_label": recorded_at.strftime("%d/%m/%Y") if recorded_at else None,
                "time_label": recorded_at.strftime("%H:%M:%S") if recorded_at else None,
                "message": message,
                "severity": _classify_severity(message),
            }
        )

    return alarms


def _get_table_columns(connection: Any, table: str) -> dict[str, str]:
    with connection.cursor() as cursor:
        cursor.execute(f"SHOW COLUMNS FROM `{table}`")
        return {
            (row.get("Field") or "").strip().lower(): row.get("Field")
            for row in cursor.fetchall()
            if row.get("Field")
        }


def _pick_column(columns: dict[str, str], candidates: tuple[str, ...]) -> str | None:
    for candidate in candidates:
        actual = columns.get(candidate)
        if actual:
            return str(actual)
    return None


def _build_order_clause(
    timestamp_column: str | None,
    date_column: str | None,
    time_column: str | None,
    id_column: str | None,
) -> str:
    if timestamp_column:
        return f" ORDER BY `{timestamp_column}` DESC"

    if date_column and time_column:
        return f" ORDER BY `{date_column}` DESC, `{time_column}` DESC"

    if date_column:
        return f" ORDER BY `{date_column}` DESC"

    if id_column:
        return f" ORDER BY `{id_column}` DESC"

    return ""


def _resolve_timestamp(
    raw_timestamp: Any,
    raw_date: Any,
    raw_time: Any,
) -> datetime | None:
    if isinstance(raw_timestamp, datetime):
        return raw_timestamp

    if isinstance(raw_timestamp, str) and raw_timestamp.strip():
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(raw_timestamp.strip(), fmt)
            except ValueError:
                continue

    return _combine_legacy_timestamp(raw_date, raw_time)


def _combine_legacy_timestamp(
    raw_date: date | str | None,
    raw_time: time | str | timedelta | None,
) -> datetime | None:
    if raw_date in (None, "", "0000-00-00"):
        return None

    try:
        if isinstance(raw_date, datetime):
            parsed_date = raw_date.date()
        elif isinstance(raw_date, date):
            parsed_date = raw_date
        elif isinstance(raw_date, str):
            parsed_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
        else:
            return None
    except (TypeError, ValueError):
        return None

    parsed_time = _parse_time(raw_time)
    return datetime.combine(parsed_date, parsed_time)


def _parse_time(raw_time: time | str | timedelta | None) -> time:
    if isinstance(raw_time, time):
        return raw_time

    if isinstance(raw_time, timedelta):
        total_seconds = int(raw_time.total_seconds())
        hours = (total_seconds // 3600) % 24
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        return time(hour=hours, minute=minutes, second=seconds)

    if isinstance(raw_time, str) and raw_time.strip() not in ("", "00:00:00"):
        try:
            return datetime.strptime(raw_time.strip(), "%H:%M:%S").time()
        except ValueError:
            return time(0, 0, 0)

    return time(0, 0, 0)


def _classify_severity(message: str) -> str:
    lowered = message.lower()

    if any(keyword in lowered for keyword in _ALARM_KEYWORDS):
        return "alarm"

    if any(keyword in lowered for keyword in _WARNING_KEYWORDS):
        return "warning"

    return "info"


def _stringify(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace").strip()

    return str(value).strip()


def _to_int(value: Any) -> int | None:
    if value is None:
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None
