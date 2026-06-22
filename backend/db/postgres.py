from typing import Any

import psycopg
from psycopg.rows import dict_row

from config import settings


def get_postgres_connection() -> psycopg.Connection:
    return psycopg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        dbname=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password,
        row_factory=dict_row,
    )


def get_client_record(client_slug: str) -> dict[str, Any] | None:
    with get_postgres_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT client_slug, client_name, db_host, db_name, db_user, db_password, is_active
                FROM clients
                WHERE client_slug = %s
                LIMIT 1
                """,
                (client_slug,),
            )
            return cursor.fetchone()
