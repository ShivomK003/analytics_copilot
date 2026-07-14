from fastapi import APIRouter, HTTPException

from app.services.metrics_service import get_dashboard_metrics


router = APIRouter(
    prefix="/metrics",
    tags=["Metrics"],
)


@router.get("")
def metrics() -> dict:
    """Return dashboard metrics."""

    try:
        return get_dashboard_metrics()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve analytics metrics.",
        ) from exc
