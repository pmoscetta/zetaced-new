from datetime import datetime

from pydantic import BaseModel, Field


class DataQueryParams(BaseModel):
    station_ids: list[int] = Field(default_factory=list)
    sensor_ids: list[int] = Field(default_factory=list)
    date_from: datetime | None = None
    date_to: datetime | None = None
    alignment_seconds: int = Field(default=60, ge=0, le=3600)


class DataColumnResponse(BaseModel):
    column_key: str
    station_id: int
    station_name: str
    sensor_type_id: int
    sensor_name: str


class DataRowResponse(BaseModel):
    timestamp: datetime
    date_label: str
    time_labels: list[str]
    values: dict[str, float | None]


class DataResponse(BaseModel):
    columns: list[DataColumnResponse]
    rows: list[DataRowResponse]
