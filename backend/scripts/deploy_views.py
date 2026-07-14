from __future__ import annotations

import logging
from pathlib import Path

from app.db import get_connection


LOGGER = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[1]
ANALYTICS_SQL_DIR = BACKEND_DIR / "sql" / "analytics"


def configure_logging() -> None:
    """Configure console logging."""

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def get_sql_files() -> list[Path]:
    """Return analytics SQL files in filename order."""

    if not ANALYTICS_SQL_DIR.exists():
        raise FileNotFoundError(
            f"Analytics SQL directory does not exist: {ANALYTICS_SQL_DIR}"
        )

    sql_files = sorted(ANALYTICS_SQL_DIR.glob("*.sql"))

    if not sql_files:
        raise FileNotFoundError(f"No SQL files found in {ANALYTICS_SQL_DIR}")

    return sql_files


def contains_executable_sql(sql_text: str) -> bool:
    """
    Check whether a SQL file contains something other than comments.

    This is sufficient for the Phase A placeholder files. Once SQL files
    contain real view definitions, they will be executed normally.
    """

    for line in sql_text.splitlines():
        stripped_line = line.strip()

        if not stripped_line:
            continue

        if stripped_line.startswith("--"):
            continue

        return True

    return False


def deploy_sql_file(cursor, sql_file: Path) -> bool:
    """
    Execute one analytics SQL file.

    Returns True when the file contained executable SQL.
    """

    sql_text = sql_file.read_text(encoding="utf-8")

    if not contains_executable_sql(sql_text):
        LOGGER.info("Skipping placeholder file: %s", sql_file.name)
        return False

    LOGGER.info("Deploying %s", sql_file.name)
    cursor.execute(sql_text)
    LOGGER.info("Successfully deployed %s", sql_file.name)

    return True


def deploy_views() -> None:
    """Deploy all analytics SQL files in one transaction."""

    sql_files = get_sql_files()
    executed_count = 0

    LOGGER.info(
        "Found %d analytics SQL files.",
        len(sql_files),
    )

    conn = get_connection()

    try:
        with conn.cursor() as cursor:
            for sql_file in sql_files:
                if deploy_sql_file(cursor, sql_file):
                    executed_count += 1

        conn.commit()

    except Exception:
        conn.rollback()
        LOGGER.exception("Analytics deployment failed. All changes were rolled back.")
        raise

    finally:
        conn.close()

    LOGGER.info(
        "Analytics deployment completed. Executed %d of %d files.",
        executed_count,
        len(sql_files),
    )


def main() -> None:
    """Run analytics deployment."""

    configure_logging()
    deploy_views()


if __name__ == "__main__":
    main()
