import json

from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


tokenizer = AutoTokenizer.from_pretrained(
    "google/flan-t5-small"
)
model = AutoModelForSeq2SeqLM.from_pretrained(
    "google/flan-t5-small",
    device_map="auto"
)

with open("experiments/retrieval/relevance_eval.json", "r", encoding="utf-8") as file:
    data = json.load(file)

for query_data in data:
    query = query_data["query"]
    documents = query_data["documents"]

    print(f"{query_data['query_id']}:")
    print("---------------------------------")
    for document in documents:
        input_text = (
            "Determine whether the passage is relevant to the question.\n"
            f"Question: {query}\n"
            f"Passage: {document['text']}\n"
            "Is the passage relevant and consistent with the question? "
            "Answer yes or no."
        )
        inputs = tokenizer(input_text, return_tensors="pt").to(model.device)

        outputs = model.generate(**inputs, max_new_tokens=5, do_sample=False)
        print(f"For document: {document['text']}")
        print("SLM Relevance Output: ",tokenizer.decode(outputs[0], skip_special_tokens=True))

