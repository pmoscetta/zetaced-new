from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt

from config import settings
from db.mysql import verify_mysql_user
from db.postgres import get_client_record
from schemas.auth import LoginRequest, LoginResponse


class TenantNotFoundError(Exception):
    pass


class InactiveTenantError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


def create_access_token(payload: dict[str, Any]) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_expire_minutes
    )
    token_payload = {
        **payload,
        "exp": expires_at,
    }
    return jwt.encode(
        token_payload,
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def authenticate_user(login_data: LoginRequest) -> LoginResponse:
    tenant = get_client_record(login_data.client_slug)
    if not tenant:
        raise TenantNotFoundError()

    if not tenant["is_active"]:
        raise InactiveTenantError()

    user = verify_mysql_user(
        tenant=tenant,
        username=login_data.username,
        password=login_data.password,
    )
    if not user:
        raise InvalidCredentialsError()

    access_token = create_access_token(
        {
            "sub": login_data.username,
            "client_slug": tenant["client_slug"],
            "username": login_data.username,
            "user_level": user["user_level"],
        }
    )
    return LoginResponse(
        access_token=access_token,
        client_name=tenant["client_name"] or tenant["client_slug"],
        user_level=user["user_level"],
    )
