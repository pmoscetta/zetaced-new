from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ChatPage = Literal["data", "chart", "map", "alarms"]


class ChatFilters(BaseModel):
    station_ids: list[int] = Field(default_factory=list)
    sensor_ids: list[int] = Field(default_factory=list)
    date_from: datetime | None = None
    date_to: datetime | None = None
    alignment_seconds: int | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    current_page: ChatPage = "data"


class ChatResponse(BaseModel):
    reply: str
    filters: ChatFilters | None = None
