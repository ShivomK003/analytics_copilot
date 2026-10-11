import logging
import re
from pathlib import Path

import pandas as pd

from etl.config import CLEAN_DIR, RAW_DIR

RAW_PATH = RAW_DIR / "arxiv_papers_raw.csv"
CLEAN_PATH = CLEAN_DIR / "arxiv_papers_clean.csv"

AI_TOPICS = {
    "llm": ["llm", "large language model", "gpt", "transformer"],
    "rag": ["rag", "retrieval augmented"],
    "agents": ["agent", "agents"],
    "robotics": ["robot", "robotics"],
    "vision": ["vision", "image", "segmentation", "detection"],
    "multimodal": ["multimodal", "vision-language"],
    "reasoning": ["reasoning"],
    "rl": ["reinforcement learning"],
}

EXPECTED_COLUMNS = [
    "paper_id",
    "title",
    "abstract",
    "authors",
    "primary_category",
    "all_categories",
    "published_date",
    "updated_date",
    "pdf_url",
    "arxiv_url",
    "year",
    "month",
    "week",
    "detected_topics",
]


def normalize_paper_id(value: object) -> str:
    if pd.isna(value):
        return ""
    cleaned = str(value or "").strip()
    cleaned = cleaned.split("/abs/")[-1]
    return cleaned.replace("http://arxiv.org/", "").replace("https://arxiv.org/", "")


def clean_text(value: object) -> str:
    if pd.isna(value):
        return ""
    return " ".join(str(value or "").split())


def normalize_csv_list(value: object) -> str:
    if pd.isna(value) or str(value).strip() == "":
        return ""

    parts = [part.strip() for part in str(value).split(",") if part.strip()]
    seen: list[str] = []
    for part in parts:
        if part not in seen:
            seen.append(part)
    return ", ".join(seen)


def detect_topics(text: str) -> str:
    lowered = str(text).lower()
    found: list[str] = []

    for topic, keywords in AI_TOPICS.items():
        if any(keyword in lowered for keyword in keywords):
            found.append(topic)

    return ", ".join(found)


def transform_arxiv_data(
    logger: logging.Logger | None = None,
    input_path: Path | None = None,
    output_path: Path | None = None,
) -> dict[str, int]:
    active_logger = logger or logging.getLogger("etl")

    input_path = Path(input_path) if input_path is not None else RAW_PATH
    output_path = Path(output_path) if output_path is not None else CLEAN_PATH

    df = pd.read_csv(input_path)

    raw_papers = int(len(df))

    df["paper_id"] = df["paper_id"].apply(normalize_paper_id)
    df["title"] = df["title"].apply(clean_text)
    df["abstract"] = df["abstract"].apply(clean_text)
    df["authors"] = df["authors"].apply(normalize_csv_list)
    df["all_categories"] = df["all_categories"].apply(normalize_csv_list)
    df["primary_category"] = df["primary_category"].apply(clean_text)
    df["pdf_url"] = df["pdf_url"].apply(clean_text)
    df["arxiv_url"] = df["arxiv_url"].apply(clean_text)

    df["published_date"] = pd.to_datetime(df["published_date"], errors="coerce", utc=True)
    df["updated_date"] = pd.to_datetime(df["updated_date"], errors="coerce", utc=True)

    df["year"] = df["published_date"].dt.year.astype("Int64")
    df["month"] = df["published_date"].dt.month.astype("Int64")
    df["week"] = df["published_date"].dt.isocalendar().week.astype("Int64")

    combined_text = (df["title"].fillna("") + " " + df["abstract"].fillna("")).str.replace(
        re.compile(r"\s+"), " ", regex=True
    )
    df["detected_topics"] = combined_text.apply(detect_topics)

    before_dedup = len(df)
    df = df.drop_duplicates(subset=["paper_id"], keep="first").copy()
    duplicates_removed = int(before_dedup - len(df))

    df["published_date"] = df["published_date"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    df["updated_date"] = df["updated_date"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    df = df[EXPECTED_COLUMNS]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)

    metrics = {
        "raw_papers": raw_papers,
        "clean_papers": int(len(df)),
        "duplicates_removed": duplicates_removed,
    }
    active_logger.info("Saved clean arXiv data to %s", output_path)
    return metrics


def main() -> None:
    transform_arxiv_data()


if __name__ == "__main__":
    main()
