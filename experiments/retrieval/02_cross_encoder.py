from sentence_transformers import CrossEncoder

model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L2-v2")

papers = [
    "Agents coordinate by frequently exchanging messages.",
    "Agents coordinate without exchanging any messages.",
    "Agents coordinate using shared environmental observations.",
    "Agents communicate through a centralized message broker."
]

query = "How can AI agents cooperate without exchanging messages?"


pairs = [(query, paper) for paper in papers]
scores = model.predict(pairs)
similarity_scores = list(zip(papers, scores))
similarity_scores.sort(key=lambda x: x[1], reverse=True)

print("Similarity Scores:")
for paper, score in similarity_scores:
    print(f"Paper: {paper}\nScore: {score:.4f}")