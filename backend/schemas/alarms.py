from datetime import datetime
from typing import Literal

from pydantic import BaseModel

AlarmSeverity = Literal["alarm", "warning", "info"]


class AlarmResponse(BaseModel):
    id: int | None
    timestamp: datetime | None
    date_label: str | None
    time_label: str | None
    message: str
    severity: AlarmSeverity
