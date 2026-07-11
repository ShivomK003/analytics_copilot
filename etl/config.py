import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
CLEAN_DIR = DATA_DIR / "clean"
WAREHOUSE_DIR = DATA_DIR / "warehouse"
REPORTS_DIR = DATA_DIR / "reports"
LOGS_DIR = ROOT_DIR / "logs"
ENV_PATH = ROOT_DIR / "backend" / ".env"

load_dotenv(ENV_PATH)

ARXIV_CATEGORIES = ["cs.AI", "cs.LG", "cs.CL", "cs.CV", "cs.RO", "stat.ML"]
ARXIV_MAX_RESULTS = int(os.getenv("ARXIV_MAX_RESULTS", "100"))

REQUIRED_ENV_VARS = [
    "SUPABASE_HOST",
    "SUPABASE_PORT",
    "SUPABASE_DB",
    "SUPABASE_USER",
    "SUPABASE_PASSWORD",
]


def ensure_directories() -> None:
    for directory in (RAW_DIR, CLEAN_DIR, WAREHOUSE_DIR, REPORTS_DIR, LOGS_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def validate_environment() -> None:
    missing = [name for name in REQUIRED_ENV_VARS if not os.getenv(name)]
    if missing:
        missing_list = ", ".join(missing)
        raise RuntimeError(
            f"Missing required environment variables in {ENV_PATH}: {missing_list}"
        )


def get_database_config() -> dict[str, str]:
    validate_environment()
    return {
        "host": os.getenv("SUPABASE_HOST", ""),
        "port": os.getenv("SUPABASE_PORT", ""),
        "dbname": os.getenv("SUPABASE_DB", ""),
        "user": os.getenv("SUPABASE_USER", ""),
        "password": os.getenv("SUPABASE_PASSWORD", ""),
    }
