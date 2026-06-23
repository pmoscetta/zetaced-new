from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth_dependencies import AuthContext, get_auth_context
from schemas.stations import (
    SensorTypeResponse,
    StationLatestResponse,
    StationSummaryResponse,
)
from services.stations import (
    StationNotFoundError,
    get_station_latest,
    list_sensor_types,
    list_stations_with_latest,
)

router = APIRouter(tags=["stations"])


@router.get("/api/stations", response_model=list[StationSummaryResponse])
def get_stations(
    view: Literal["map", "monitor"] = Query(default="monitor"),
    auth: AuthContext = Depends(get_auth_context),
) -> list[StationSummaryResponse]:
    return list_stations_with_latest(auth.tenant, auth.user_level, view)


@router.get("/api/stations/{station_id}/latest", response_model=StationLatestResponse)
def get_station_latest_readings(
    station_id: int,
    view: Literal["map", "monitor"] = Query(default="monitor"),
    auth: AuthContext = Depends(get_auth_context),
) -> StationLatestResponse:
    try:
        return get_station_latest(auth.tenant, station_id, auth.user_level, view)
    except StationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Station not found.",
        ) from exc


@router.get("/api/sensors", response_model=list[SensorTypeResponse])
def get_sensors(
    view: Literal["map", "monitor", "results"] = Query(default="results"),
    auth: AuthContext = Depends(get_auth_context),
) -> list[SensorTypeResponse]:
    return list_sensor_types(auth.tenant, auth.user_level, view)
