import argparse
import json
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT_DIR / ".env"
DEFAULT_INPUT_PATH = ROOT_DIR / "configs_estratte.json"

load_dotenv(ENV_PATH)
sys.path.insert(0, str(ROOT_DIR))

from extract_configs import extract_configs, validate_env, write_outputs  # noqa: E402

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB")
POSTGRES_USER = os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")


def validate_postgres_env():
    required_vars = {
        "POSTGRES_HOST": POSTGRES_HOST,
        "POSTGRES_PORT": POSTGRES_PORT,
        "POSTGRES_DB": POSTGRES_DB,
        "POSTGRES_USER": POSTGRES_USER,
        "POSTGRES_PASSWORD": POSTGRES_PASSWORD,
    }
    missing = [name for name, value in required_vars.items() if not value]
    if missing:
        missing_list = ", ".join(missing)
        raise ValueError(f"Variabili PostgreSQL mancanti nel file .env: {missing_list}")


def get_connection():
    return psycopg.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
    )


def create_schema(connection):
    with connection.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                client_slug VARCHAR(100) UNIQUE NOT NULL,
                client_name VARCHAR(255),
                db_host VARCHAR(255) NOT NULL DEFAULT 'new.zetaced.com',
                db_name VARCHAR(100) NOT NULL,
                db_user VARCHAR(100) NOT NULL,
                db_password VARCHAR(255) NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS sync_log (
                id SERIAL PRIMARY KEY,
                sync_date TIMESTAMP DEFAULT NOW(),
                clients_found INTEGER,
                clients_added INTEGER,
                clients_updated INTEGER,
                errors TEXT,
                duration_ms INTEGER
            );
            """
        )
    connection.commit()


def load_input_data(input_path, run_extract):
    if run_extract:
        validate_env()
        result = extract_configs()
        write_outputs(result)
        return result

    payload = json.loads(Path(input_path).read_text(encoding="utf-8"))
    return payload


def upsert_clients(connection, result):
    inserted = 0
    updated = 0

    with connection.cursor() as cur:
        for config in result["valid_configs"]:
            if not config.get("db_name") or not config.get("db_user") or not config.get("db_password"):
                continue

            cur.execute(
                """
                INSERT INTO clients (
                    client_slug,
                    client_name,
                    db_host,
                    db_name,
                    db_user,
                    db_password,
                    is_active,
                    created_at,
                    updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, true, NOW(), NOW())
                ON CONFLICT (client_slug) DO UPDATE
                SET
                    client_name = EXCLUDED.client_name,
                    db_host = EXCLUDED.db_host,
                    db_name = EXCLUDED.db_name,
                    db_user = EXCLUDED.db_user,
                    db_password = EXCLUDED.db_password,
                    is_active = true,
                    updated_at = NOW()
                RETURNING (xmax = 0) AS inserted;
                """,
                (
                    config["client_slug"],
                    config["client_name"],
                    config["db_host"],
                    config["db_name"],
                    config["db_user"],
                    config["db_password"],
                ),
            )
            was_inserted = cur.fetchone()[0]
            if was_inserted:
                inserted += 1
            else:
                updated += 1

        cur.execute(
            """
            INSERT INTO sync_log (
                clients_found,
                clients_added,
                clients_updated,
                errors,
                duration_ms
            )
            VALUES (%s, %s, %s, %s, %s);
            """,
            (
                len(result["valid_configs"]),
                inserted,
                updated,
                json.dumps(result["errors"], ensure_ascii=True) if result["errors"] else None,
                None,
            ),
        )
    connection.commit()
    return inserted, updated


def main():
    parser = argparse.ArgumentParser(description="Importa i tenant Zetaced nel PostgreSQL master.")
    parser.add_argument(
        "--input",
        default=str(DEFAULT_INPUT_PATH),
        help="Percorso al file JSON di estrazione.",
    )
    parser.add_argument(
        "--extract",
        action="store_true",
        help="Esegue prima l'estrazione SSH e poi importa direttamente il risultato.",
    )
    args = parser.parse_args()

    validate_postgres_env()
    result = load_input_data(args.input, args.extract)

    with get_connection() as connection:
        create_schema(connection)
        inserted, updated = upsert_clients(connection, result)

    print(
        "Import completato: "
        f"{len(result['valid_configs'])} configurazioni valide, "
        f"{inserted} inserite, {updated} aggiornate, "
        f"{len(result['errors'])} errori/skip."
    )


if __name__ == "__main__":
    main()
