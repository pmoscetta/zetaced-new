from fastapi import APIRouter, Depends, Query

from auth_dependencies import AuthContext, get_auth_context
from schemas.alarms import AlarmResponse
from services.alarms import list_alarms

router = APIRouter(tags=["alarms"])


@router.get("/api/alarms", response_model=list[AlarmResponse])
def get_alarms(
    limit: int = Query(default=50, ge=1, le=200),
    auth: AuthContext = Depends(get_auth_context),
) -> list[AlarmResponse]:
    return list_alarms(auth.tenant, limit)
