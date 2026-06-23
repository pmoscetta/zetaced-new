from datetime import datetime

from fastapi import APIRouter, Depends, Query

from auth_dependencies import AuthContext, get_auth_context
from schemas.chart import ChartResponse
from schemas.data import DataQueryParams
from services.data import get_chart_data

router = APIRouter(tags=["chart"])


@router.get("/api/chart", response_model=ChartResponse)
def get_chart(
    station_ids: list[int] = Query(default_factory=list),
    sensor_ids: list[int] = Query(default_factory=list),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    alignment_seconds: int = Query(default=300, ge=0, le=3600),
    auth: AuthContext = Depends(get_auth_context),
) -> ChartResponse:
    params = DataQueryParams(
        station_ids=station_ids,
        sensor_ids=sensor_ids,
        date_from=date_from,
        date_to=date_to,
        alignment_seconds=alignment_seconds,
    )
    return get_chart_data(auth.tenant, params, auth.user_level)
