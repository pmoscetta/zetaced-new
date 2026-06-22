from datetime import datetime

from pydantic import BaseModel


class ChartPointResponse(BaseModel):
    timestamp: datetime
    value: float


class ChartSeriesResponse(BaseModel):
    series_key: str
    station_id: int
    station_name: str
    sensor_type_id: int
    sensor_name: str
    points: list[ChartPointResponse]


class ChartResponse(BaseModel):
    series: list[ChartSeriesResponse]
