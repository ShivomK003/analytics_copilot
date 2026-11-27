import psycopg2

from etl.config import get_database_config


def test_etl_connection() -> None:
    conn = psycopg2.connect(**get_database_config())
    try:
        with conn.cursor() as cur:
            cur.execute("select count(*) from fact_papers;")
            result = cur.fetchone()
        assert result is not None
        assert isinstance(result[0], int)
    finally:
        conn.close()
