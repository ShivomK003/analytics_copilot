from pathlib import Path
import pandas as pd

RAW_PATH = Path("data/raw/arxiv_papers_raw.csv")
CLEAN_PATH = Path("data/clean/arxiv_papers_clean.csv")

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


def detect_topics(text):
    text = str(text).lower()

    found = []

    for topic, keywords in AI_TOPICS.items():
        for keyword in keywords:
            if keyword in text:
                found.append(topic)
                break

    return ", ".join(found)


def main():
    df = pd.read_csv(RAW_PATH)

    df["published_date"] = pd.to_datetime(df["published_date"])

    df["year"] = df["published_date"].dt.year
    df["month"] = df["published_date"].dt.month
    df["week"] = df["published_date"].dt.isocalendar().week

    df["detected_topics"] = (
        df["title"].fillna("") + " " + df["abstract"].fillna("")
    ).apply(detect_topics)

    df = df.drop_duplicates(subset=["paper_id"])

    df.to_csv(CLEAN_PATH, index=False)

    print(df.shape)
    print(f"Saved: {CLEAN_PATH}")


if __name__ == "__main__":
    main()
