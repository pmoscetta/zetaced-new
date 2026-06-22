import hashlib
from contextlib import contextmanager
from typing import Any, Iterator

import pymysql
from pymysql.connections import Connection
from sshtunnel import SSHTunnelForwarder

from config import settings


@contextmanager
def open_mysql_tunnel() -> SSHTunnelForwarder:
    tunnel = SSHTunnelForwarder(
        (settings.ssh_host, 22),
        ssh_username=settings.ssh_user,
        ssh_password=settings.ssh_password,
        remote_bind_address=("127.0.0.1", settings.mysql_remote_port),
    )
    tunnel.start()
    try:
        yield tunnel
    finally:
        tunnel.stop()


@contextmanager
def open_tenant_mysql_connection(tenant: dict[str, Any]) -> Iterator[Connection]:
    with open_mysql_tunnel() as tunnel:
        connection = pymysql.connect(
            host="127.0.0.1",
            port=tunnel.local_bind_port,
            user=tenant["db_user"],
            password=tenant["db_password"],
            database=tenant["db_name"],
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=10,
            read_timeout=10,
            write_timeout=10,
            autocommit=True,
        )

        try:
            yield connection
        finally:
            connection.close()


def get_station_longitude_column(connection: Connection) -> str:
    with connection.cursor() as cursor:
        cursor.execute("SHOW COLUMNS FROM dv_zetaced_station")
        columns = {
            (row.get("Field") or "").strip().lower(): row.get("Field")
            for row in cursor.fetchall()
        }

    for candidate in ("longitude", "longitudine"):
        if candidate in columns and columns[candidate]:
            return str(columns[candidate])

    raise RuntimeError("Longitude column not found on dv_zetaced_station.")


def verify_mysql_user(
    tenant: dict[str, Any],
    username: str,
    password: str,
) -> bool:
    password_hash = hashlib.md5(password.encode()).hexdigest()

    with open_tenant_mysql_connection(tenant) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT userid, password
                FROM dv_user
                WHERE userid = %s
                LIMIT 1
                """,
                (username,),
            )
            record = cursor.fetchone()

    if not record:
        return False

    stored_hash = (record.get("password") or "").strip().lower()
    return stored_hash == password_hash
