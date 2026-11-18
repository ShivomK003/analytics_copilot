import json

def fetch_sample_papers():
    with open("experiments/retrieval/real_samples.json", "r", encoding="utf-8") as file:
        data = json.load(file)

    return data

sample_papers = fetch_sample_papers()

judgments = {
    paper["paper_id"]: 0
    for paper in sample_papers
}

# Highly relevant
for paper_id in [
    "2607.24577v1",
    "2610.34609v1",
    "2610.25836v1",
    "2609.34929v1",
    "2609.38142v1",
    "2610.32130v1",
]:
    judgments[paper_id] = 2

# Partially relevant
for paper_id in [
    "2610.20786v1",
    "2611.16188v1",
    "2608.06088v1",
]:
    judgments[paper_id] = 1

assert len(judgments) == 60

evaluation = {
    "query": "reinforcement learning",
    "judgments": judgments
}

with open(
    "experiments/retrieval/relevance_judgments.json",
    "w",
    encoding="utf-8"
) as f:
    json.dump(evaluation, f, indent=2)