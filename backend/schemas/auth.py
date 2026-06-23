from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    client_slug: str = Field(min_length=1)
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    client_name: str
    user_level: int
