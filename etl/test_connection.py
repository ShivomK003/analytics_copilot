from pathlib import Path
from dotenv import load_dotenv
import os
import psycopg2

ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT_DIR / "backend" / ".env"

load_dotenv(ENV_PATH)

print("ENV PATH:", ENV_PATH)
print("HOST:", os.getenv("SUPABASE_HOST"))

conn = psycopg2.connect(
    host=os.getenv("SUPABASE_HOST"),
    port=os.getenv("SUPABASE_PORT"),
    dbname=os.getenv("SUPABASE_DB"),
    user=os.getenv("SUPABASE_USER"),
    password=os.getenv("SUPABASE_PASSWORD"),
)

cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM fact_papers;")

print("Connection successful")
print("Rows currently in fact_papers:", cur.fetchone()[0])

cur.close()
conn.close()
