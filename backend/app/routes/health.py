from fastapi import APIRouter, HTTPException

from app.db import fetch_one


router = APIRouter(
    prefix="/health",
    tags=["Health"],
)


@router.get("")
def health() -> dict[str, str]:
    """Check whether the API can reach the database."""

    try:
        result = fetch_one(
            """
            select 1 as database_available;
            """
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed.",
        ) from exc

    if not result or result["database_available"] != 1:
        raise HTTPException(
            status_code=503,
            detail="Database health check failed.",
        )

    return {
        "status": "ok",
        "database": "connected",
    }
