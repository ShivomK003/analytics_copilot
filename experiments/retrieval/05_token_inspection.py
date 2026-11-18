import json

from sentence_transformers import SentenceTransformer, util

with open("experiments/retrieval/real_samples.json", "r", encoding="utf-8") as file:
    sample_data = json.load(file)


model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
tokenizer = model.tokenizer

print("Model Max Seq Len: ", model.max_seq_length)

for paper in sample_data:
    input_text = f"""
        Title: {paper["title"]}
        Abstract: {paper["abstract"]}
    """
    print(f"Paper {paper["paper_id"]}:")
    inputs = tokenizer(input_text)
    print(len(inputs['input_ids']))
    


