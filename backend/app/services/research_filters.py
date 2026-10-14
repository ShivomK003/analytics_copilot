"""Narrow UTC publication-date and topic-selection helpers for intelligence."""

import re
from collections.abc import Sequence
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, Query

from app.db import fetch_all
from app.errors import DatabasePoolTimeout


def parse_date_range(
    date_from: str | date | None = None,
    date_to: str | date | None = None,
) -> tuple[date | None, date | None]:
    """Parse strict ISO calendar dates; raise ValueError for invalid ranges."""

    def parse(value: str | date | None) -> date | None:
        if value is None or type(value) is date:
            return value
        if not isinstance(value, str) or not re.fullmatch(
            r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value
        ):
            raise ValueError("Dates must use YYYY-MM-DD format.")
        return date.fromisoformat(value)

    start, end = parse(date_from), parse(date_to)
    if start is not None and end is not None and start > end:
        raise ValueError("date_from cannot be later than date_to.")
    return start, end


def utc_boundaries(
    date_from: date | None,
    date_to: date | None,
) -> tuple[datetime | None, datetime | None]:
    """Return inclusive start/exclusive end UTC midnights; missing sides are unbounded.

    The maximum Python date cannot have a following midnight and raises ValueError.
    """
    start, end = parse_date_range(date_from, date_to)
    lower = datetime.combine(start, time.min, timezone.utc) if start else None
    try:
        upper = (
            datetime.combine(end + timedelta(days=1), time.min, timezone.utc)
            if end else None
        )
    except OverflowError as exc:
        raise ValueError(
            "date_to must have a representable following UTC midnight."
        ) from exc
    return lower, upper


def publication_date_predicate(
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[str, list[datetime]]:
    """Build predicates for alias p, with bound UTC parameters and no SQL values.

    Undated publications are excluded even for an unbounded analytical interval.
    """
    lower, upper = utc_boundaries(date_from, date_to)
    conditions = ["p.published_date is not null"]
    params: list[datetime] = []
    if lower is not None:
        conditions.append("p.published_date >= %s")
        params.append(lower)
    if upper is not None:
        conditions.append("p.published_date < %s")
        params.append(upper)
    return " and ".join(conditions), params


def analytical_date_range(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> tuple[date | None, date | None]:
    """FastAPI dependency enforcing strict date syntax and HTTP 422 errors."""
    try:
        dates = parse_date_range(date_from, date_to)
        utc_boundaries(*dates)
        return dates
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def normalize_topic_ids(topic_ids: Sequence[int] | None = None) -> list[int]:
    """Return sorted unique positive integer selections; invalid values raise ValueError."""
    values = list(topic_ids) if topic_ids is not None else []
    if any(type(value) is not int or value <= 0 for value in values):
        raise ValueError("Topic IDs must be positive integers.")
    return sorted(set(values))


def validate_topic_ids(topic_ids: Sequence[int] | None = None) -> list[int]:
    """Validate selections against dim_topic in one query; unknown IDs raise ValueError.

    This validates selection only and does not assign ANY/ALL paper-match semantics.
    An omitted/empty selection requires no database query.
    """
    normalized = normalize_topic_ids(topic_ids)
    if not normalized:
        return []
    rows = fetch_all(
        "select topic_id from dim_topic where topic_id = any(%s::numeric[]);",
        (normalized,),
    )
    unknown = sorted(set(normalized) - {row["topic_id"] for row in rows})
    if unknown:
        raise ValueError(f"Unknown topic IDs: {', '.join(map(str, unknown))}.")
    return normalized


def analytical_topic_ids(
    topic_id: list[int] | None = Query(default=None),
) -> list[int]:
    """FastAPI dependency accepting repeated topic_id values and returning HTTP 422."""
    try:
        return validate_topic_ids(topic_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DatabasePoolTimeout:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unable to validate topics.") from exc


def evidence_topic_ids(
    topic_id: list[int] | None = Query(default=None),
) -> list[int]:
    """Validate zero, one or two distinct topic IDs; duplicates are evidence input errors.

    Unlike chart selection, repeats must not silently collapse an intended pair.
    Existing normalization/existence checks remain the source of topic validity.
    """
    values = topic_id or []
    if len(values) > 2:
        raise HTTPException(status_code=422, detail="Evidence accepts at most two topic IDs.")
    if len(values) != len(set(values)):
        raise HTTPException(status_code=422, detail="Evidence topic IDs must be distinct.")
    try:
        return validate_topic_ids(values)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DatabasePoolTimeout:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unable to validate topics.") from exc


def evidence_category(
    category: str | None = Query(default=None, min_length=1, max_length=50),
) -> str | None:
    """Resolve a known category to its stored code; blank/unknown/ambiguous codes yield 422."""
    if category is None:
        return None
    code = category.strip()
    if not code:
        raise HTTPException(status_code=422, detail="Category cannot be blank.")
    try:
        rows = fetch_all(
            "select category_code from dim_category where lower(category_code) = lower(%s);",
            (code,),
        )
    except DatabasePoolTimeout:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unable to validate evidence category.") from exc
    if len(rows) != 1:
        raise HTTPException(status_code=422, detail="Unknown or ambiguous category code.")
    return rows[0]["category_code"]
