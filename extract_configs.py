import json
import os
import re
from pathlib import Path

import paramiko
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)

SSH_HOST = os.getenv("SSH_HOST")
SSH_USER = os.getenv("SSH_USER")
SSH_PASSWORD = os.getenv("SSH_PASSWORD")
REMOTE_BASE_PATH = os.getenv("SSH_REMOTE_BASE_PATH", "/var/www/vhosts/new.zetaced.com/httpdocs")
MYSQL_REMOTE_HOST = os.getenv("MYSQL_REMOTE_HOST", "new.zetaced.com")
TEXT_OUTPUT_FILE = "configs_estratte.txt"
JSON_OUTPUT_FILE = "configs_estratte.json"


def validate_env():
    required_vars = {
        "SSH_HOST": SSH_HOST,
        "SSH_USER": SSH_USER,
        "SSH_PASSWORD": SSH_PASSWORD,
    }
    missing = [name for name, value in required_vars.items() if not value]
    if missing:
        missing_list = ", ".join(missing)
        raise ValueError(f"Variabili mancanti nel file .env: {missing_list}")


def parse_php_config(content):
    patterns = {
        "db_host": r'\$database_host\s*=\s*["\']([^"\']+)["\']',
        "db_name": r'\$database_name\s*=\s*["\']([^"\']+)["\']',
        "db_user": r'\$database_userid\s*=\s*["\']([^"\']+)["\']',
        "db_password": r'\$database_password\s*=\s*["\']([^"\']+)["\']',
        "client_name": r'\$client_name\s*=\s*["\']([^"\']+)["\']',
    }
    result = {}
    for key, pattern in patterns.items():
        match = re.search(pattern, content)
        result[key] = match.group(1) if match else None
    return result


def normalize_config(parsed, client_dir):
    db_name = (parsed.get("db_name") or "").strip()
    if not db_name:
        return None

    return {
        "client_slug": db_name,
        "client_name": db_name,
        "db_host": MYSQL_REMOTE_HOST,
        "db_name": db_name,
        "db_user": (parsed.get("db_user") or "").strip() or None,
        "db_password": (parsed.get("db_password") or "").strip() or None,
        "source_directory": client_dir,
        "legacy_db_host": (parsed.get("db_host") or "").strip() or None,
        "legacy_client_name": (parsed.get("client_name") or "").strip() or None,
    }


def extract_configs():
    print(f"Connessione SSH a {SSH_HOST}...")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASSWORD)
    except Exception as e:
        raise RuntimeError(f"ERRORE connessione SSH: {e}") from e

    sftp = ssh.open_sftp()
    print("Connesso! Scansione directory in corso...\n")

    try:
        dirs = sftp.listdir(REMOTE_BASE_PATH)
    except Exception as e:
        sftp.close()
        ssh.close()
        raise RuntimeError(f"ERRORE lettura directory {REMOTE_BASE_PATH}: {e}") from e

    configs = []
    errors = []

    try:
        for client_dir in sorted(dirs):
            config_path = f"{REMOTE_BASE_PATH}/{client_dir}/configuration.php"
            try:
                with sftp.open(config_path, "r") as f:
                    content = f.read().decode("utf-8", errors="ignore")

                parsed = parse_php_config(content)
                normalized = normalize_config(parsed, client_dir)

                if normalized:
                    configs.append(normalized)
                    print(
                        f"  OK   {client_dir:30s} -> db={normalized['db_name']} "
                        f"user={normalized['db_user'] or 'N/A'}"
                    )
                else:
                    errors.append(
                        {
                            "source_directory": client_dir,
                            "reason": "configuration.php trovato ma db_name non estratto",
                        }
                    )
                    print(f"  WARN {client_dir:30s} -> db_name non trovato")

            except FileNotFoundError:
                errors.append(
                    {
                        "source_directory": client_dir,
                        "reason": "configuration.php non trovato",
                    }
                )
                print(f"  SKIP {client_dir:30s} -> non e' una directory cliente")
            except Exception as e:
                errors.append(
                    {
                        "source_directory": client_dir,
                        "reason": str(e),
                    }
                )
                print(f"  ERR  {client_dir:30s} -> {str(e)}")
    finally:
        sftp.close()
        ssh.close()

    return {
        "scanned_directories": len(dirs),
        "valid_configs": configs,
        "errors": errors,
    }


def write_outputs(result):
    Path(JSON_OUTPUT_FILE).write_text(
        json.dumps(result, indent=2, ensure_ascii=True),
        encoding="utf-8",
    )

    with open(TEXT_OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("=" * 60 + "\n")
        f.write("REPORT ESTRAZIONE CONFIGURAZIONI ZETACED\n")
        f.write("=" * 60 + "\n")
        f.write(f"Totale directory scansionate : {result['scanned_directories']}\n")
        f.write(f"Configurazioni valide        : {len(result['valid_configs'])}\n")
        f.write(f"Errori/Skip                  : {len(result['errors'])}\n")
        f.write("=" * 60 + "\n\n")

        f.write("CONFIGURAZIONI ESTRATTE CON SUCCESSO:\n")
        f.write("-" * 60 + "\n")
        for config in result["valid_configs"]:
            f.write(f"\nCliente         : {config['client_slug']}\n")
            f.write(f"Nome            : {config['client_name']}\n")
            f.write(f"DB Host         : {config['db_host']}\n")
            f.write(f"DB Name         : {config['db_name']}\n")
            f.write(f"DB User         : {config.get('db_user') or 'N/A'}\n")
            f.write(f"Source Directory: {config.get('source_directory') or 'N/A'}\n")
            f.write(f"Legacy Name     : {config.get('legacy_client_name') or 'N/A'}\n")
            f.write(f"DB Pass         : [REDACTED]\n")
            f.write("-" * 60 + "\n")

        if result["errors"]:
            f.write("\n\nSKIP / ERRORI:\n")
            f.write("-" * 60 + "\n")
            for error in result["errors"]:
                f.write(
                    f"  {error['source_directory']:30s} -> {error['reason']}\n"
                )


def main():
    try:
        validate_env()
        result = extract_configs()
    except (RuntimeError, ValueError) as e:
        print(str(e))
        return

    write_outputs(result)

    print(
        f"\nFatto! Trovate {len(result['valid_configs'])} configurazioni, "
        f"{len(result['errors'])} skip/errori."
    )
    print(f"Risultati salvati in: {TEXT_OUTPUT_FILE}, {JSON_OUTPUT_FILE}")

if __name__ == "__main__":
    main()
