from fastapi import FastAPI

from config import settings
from routers.auth import router as auth_router
from routers.chart import router as chart_router
from routers.data import router as data_router
from routers.stations import router as stations_router

app = FastAPI(title=settings.app_name)
app.include_router(auth_router)
app.include_router(chart_router)
app.include_router(data_router)
app.include_router(stations_router)


@app.get("/api/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {
        "status": "ok",
        "environment": settings.app_env,
    }
