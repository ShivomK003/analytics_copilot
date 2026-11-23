from sentence_transformers import SentenceTransformer, util



model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")


papers = [
    "Agents coordinate by frequently exchanging messages.",
    "Agents coordinate without exchanging any messages.",
    "Agents coordinate using shared environmental observations.",
    "Agents communicate through a centralized message broker."
]

query = "How can AI agents cooperate without exchanging messages?"


query_embeddings = model.encode_query(query)
document_embeddings = model.encode_document(papers)
print(query_embeddings.shape, document_embeddings.shape)
print(type(query_embeddings), type(document_embeddings)) 

similarities = util.cos_sim(query_embeddings, document_embeddings)[0].numpy()
similarity_scores = list(zip(papers, similarities))
similarity_scores.sort(key=lambda x: x[1], reverse=True)

print("Similarity Scores:")
for paper, score in similarity_scores:
    print(f"Paper: {paper}\nScore: {score:.4f}\n")