import json

from sentence_transformers import CrossEncoder
from sklearn.metrics import ndcg_score

with open("experiments/retrieval/relevance_eval.json", "r", encoding="utf-8") as file:
    data = json.load(file)

model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L2-v2")

precision2_scores = []
ndcg_scores = []

for query_data in data: 
    query = query_data['query']
    documents = query_data['documents']


    pairs = [(query, document['text']) for document in documents]

    scores = model.predict(pairs)
    similarities = list(zip(documents, scores))
    similarities.sort(key=lambda x: x[1], reverse=True)

    print(f"{query_data['query_id']}:")
    print("----------------------------------------------")
    print("Similarity Scores:")
    for document, score in similarities:
        print(f"Paper: {document['text']} \nScore: {score}")
    print("----------------------------------------------")

    # Calculate NDCG score
    true_relevance = [document['relevance'] for document in documents]
    predicted_scores = scores.tolist()
    ndcg = ndcg_score([true_relevance], [predicted_scores], k=4)
    ndcg_scores.append(ndcg)

    # Calculate Precision@2
    precision_count = 0
    for document, _ in similarities[:2]:
        if document['relevance'] == 2:
            precision_count += 1
    precision2 = precision_count / 2.0
    precision2_scores.append(precision2)

    print(f"NDCG@4: {ndcg:.4f}, Precision@2: {precision2:.4f}")
    print("----------------------------------------------")
    
print("----------------------------------------------")
mean_ndcg = sum(ndcg_scores) / len(ndcg_scores)
mean_precision2 = sum(precision2_scores) / len(precision2_scores)
print(f"Mean NDCG@4: {mean_ndcg:.4f}")
print(f"Mean Precision@2: {mean_precision2:.4f}")

    




