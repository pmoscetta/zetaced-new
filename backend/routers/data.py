from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from auth_dependencies import AuthContext, get_auth_context
from schemas.data import DataQueryParams, DataResponse
from services.data import get_aligned_data
from services.export import export_data_csv, export_data_pdf

router = APIRouter(tags=["data"])


@router.get("/api/data", response_model=DataResponse)
def get_data(
    station_ids: list[int] = Query(default_factory=list),
    sensor_ids: list[int] = Query(default_factory=list),
    station_sensor_pairs: list[str] = Query(default_factory=list),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    alignment_seconds: int = Query(default=300, ge=0, le=3600),
    auth: AuthContext = Depends(get_auth_context),
) -> DataResponse:
    params = DataQueryParams(
        station_ids=station_ids,
        sensor_ids=sensor_ids,
        station_sensor_pairs=station_sensor_pairs,
        date_from=date_from,
        date_to=date_to,
        alignment_seconds=alignment_seconds,
    )
    return get_aligned_data(auth.tenant, params, auth.user_level)


@router.get("/api/data/export/csv")
def export_csv(
    station_ids: list[int] = Query(default_factory=list),
    sensor_ids: list[int] = Query(default_factory=list),
    station_sensor_pairs: list[str] = Query(default_factory=list),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    alignment_seconds: int = Query(default=300, ge=0, le=3600),
    separator: Literal["dot", "comma"] = Query(default="dot"),
    auth: AuthContext = Depends(get_auth_context),
) -> StreamingResponse:
    params = DataQueryParams(
        station_ids=station_ids,
        sensor_ids=sensor_ids,
        station_sensor_pairs=station_sensor_pairs,
        date_from=date_from,
        date_to=date_to,
        alignment_seconds=alignment_seconds,
    )
    csv_content = export_data_csv(auth.tenant, params, auth.user_level, separator)
    client_slug = auth.tenant.get("client_slug", "export")
    date_tag = date_from.strftime("%Y%m%d") if date_from else "all"
    filename = f"zetaced_{client_slug}_{date_tag}.csv"
    return StreamingResponse(
        iter([csv_content.encode("utf-8-sig")]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/api/data/export/pdf")
def export_pdf(
    station_ids: list[int] = Query(default_factory=list),
    sensor_ids: list[int] = Query(default_factory=list),
    station_sensor_pairs: list[str] = Query(default_factory=list),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    alignment_seconds: int = Query(default=300, ge=0, le=3600),
    auth: AuthContext = Depends(get_auth_context),
) -> StreamingResponse:
    params = DataQueryParams(
        station_ids=station_ids,
        sensor_ids=sensor_ids,
        station_sensor_pairs=station_sensor_pairs,
        date_from=date_from,
        date_to=date_to,
        alignment_seconds=alignment_seconds,
    )
    pdf_bytes = export_data_pdf(
        auth.tenant,
        params,
        auth.user_level,
        client_name=auth.tenant.get("client_name") or "",
    )
    client_slug = auth.tenant.get("client_slug", "export")
    date_tag = date_from.strftime("%Y%m%d") if date_from else "all"
    filename = f"zetaced_{client_slug}_{date_tag}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
