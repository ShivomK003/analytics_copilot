"""Vector index settings shared by document indexing and query retrieval."""

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
CHUNK_TOKEN_TARGET = 200
CHUNK_OVERLAP = 30
NORMALIZE_EMBEDDINGS = True
INDEX_VERSION = "v1"

INDEX_ID = (
    f"{MODEL_NAME}"
    f"::chunk-{CHUNK_TOKEN_TARGET}"
    f"::overlap-{CHUNK_OVERLAP}"
    f"::{'normalized' if NORMALIZE_EMBEDDINGS else 'unnormalized'}"
    f"::{INDEX_VERSION}"
)
