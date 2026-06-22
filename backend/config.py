from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "zetaced_master"
    postgres_user: str = "zetaced_admin"
    postgres_password: str

    mysql_remote_host: str = "new.zetaced.com"
    mysql_remote_port: int = 3306
    ssh_host: str = "new.zetaced.com"
    ssh_user: str
    ssh_password: str
    ssh_remote_base_path: str = "/var/www/vhosts/new.zetaced.com/httpdocs"

    jwt_secret: str
    jwt_expire_minutes: int = 480
    jwt_algorithm: str = "HS256"

    app_env: str = "development"
    app_name: str = "Zetaced Monitoring"

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[1] / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
