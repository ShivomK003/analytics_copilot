from datetime import datetime, timezone


def start_etl_run(conn) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into etl_runs (start_time, status)
            values (%s, %s)
            returning run_id;
            """,
            (datetime.now(timezone.utc), "RUNNING"),
        )
        run_id = str(cur.fetchone()[0])
    conn.commit()
    return run_id


def finish_etl_run(
    conn,
    run_id: str,
    papers_fetched: int,
    new_papers_loaded: int,
    duplicates_skipped: int,
    status: str,
    duration_seconds: float,
    error_message: str | None = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update etl_runs
            set end_time = %s,
                papers_fetched = %s,
                new_papers_loaded = %s,
                duplicates_skipped = %s,
                status = %s,
                duration_seconds = %s,
                error_message = %s
            where run_id = %s;
            """,
            (
                datetime.now(timezone.utc),
                papers_fetched,
                new_papers_loaded,
                duplicates_skipped,
                status,
                duration_seconds,
                error_message,
                run_id,
            ),
        )
    conn.commit()
