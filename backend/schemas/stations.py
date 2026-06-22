from datetime import datetime

from pydantic import BaseModel


class SensorTypeResponse(BaseModel):
    sensor_type_id: int
    sensor_name: str


class SensorReadingResponse(BaseModel):
    sensor_id: int | None
    sensor_type_id: int | None
    sensor_name: str
    last_value: float | None
    last_update: datetime | None


class StationSummaryResponse(BaseModel):
    station_id: int
    station_name: str
    latitude: float | None
    longitude: float | None
    latest_update: datetime | None
    sensors: list[SensorReadingResponse]


class StationLatestResponse(BaseModel):
    station_id: int
    station_name: str
    latest_update: datetime | None
    sensors: list[SensorReadingResponse]
