import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

paper_data = [{
    "paper_id": "2611.07950v1",
    "title": "Leakage- and Label-Aware Benchmarking of Class-Imbalance Strategies for Multimodal Chest X-Ray and EHR Classification",
    "abstract": "Benchmarks of class-imbalance strategies for multimodal chest X-ray (CXR) and electronic health record (EHR) prediction are often evaluated on record-level splits of cohorts in which one patient contributes several radiographs. We audit such a benchmark on 29,083 MIMIC-CXR radiographs of 10,479 patients with eight diagnosis targets. First, the record-split benchmark was misleading: a lookup table that copies the label of a development-set radiograph with the same EHR vector nearly matched the best model, and on unseen patients every model fell to the level of predicting every case positive. Second, tracing the labels back to MIMIC-IV explained why: each patient's labels are keyword matches on the diagnosis codes of a single admission, copied, with one EHR vector per patient, to all of the patient's radiographs, so about a third of the radiographs carry labels that differ from the codes of their own admission. Third, under patient-separated evaluation with admission-aligned and rule-refined labels, the initial conclusions do not hold: in the evaluated configurations no imbalance strategy raised the observed mean macro F2 over no augmentation by more than 0.01, tuned tree ensembles showed no consistent advantage over tuned logistic regression, and the released EHR variables stayed at the level of the all-positive baseline, whereas the diagnostic history available at imaging time and image embeddings exceeded it, including, with rule-refined labels, a CheXpert-trained encoder that never saw these radiographs; RAD-DINO had seen 96.6% of them during self-supervised pretraining. Adding either encoder to the diagnostic history gave no statistically significant F2 gain; exploratory AUROC gains were significant with RAD-DINO but not with DenseNet. We provide reusable diagnostics, a leakage-aware protocol and a checklist."
}]

model_name = "sentence-transformers/all-MiniLM-L6-v2"
model = SentenceTransformer(model_name)
tokenizer = model.tokenizer



for paper in paper_data:
    print(f"For {paper['paper_id']}")
    inputs = tokenizer(paper['abstract'], add_special_tokens=False, truncation=False)
    token_ids = inputs['input_ids']

    chunk_size = 200
    overlap = 30
    step = chunk_size - overlap

    chunks = []
    combined_chunks = []

    for start in range(0, len(token_ids), step):
        chunk_ids = token_ids[start:start+chunk_size]
        chunk_text = tokenizer.decode(
            chunk_ids,
            skip_special_tokens= True
        )
        chunks.append(chunk_text)

        if start + chunk_size >= len(token_ids):
            break

    for chunk in chunks: 
        combined_text = f"{paper['title']}\n{chunk}"
        combined_chunks.append(combined_text)
        encoded = tokenizer(
            combined_text,
            add_special_tokens=True,
            truncation=False
        )
        token_count = len(encoded["input_ids"])

        assert token_count <= model.max_seq_length, (
            f"Chunk exceeds model limit: {token_count}"
        )

    embeddings = model.encode_document(
            combined_chunks,
            normalize_embeddings=True
        )

    print(embeddings.shape)

    records = []
    for chunk_index, (chunk_text, embedding) in enumerate(zip(combined_chunks, embeddings)):
        records.append((
            paper['paper_id'],
            chunk_index,
            chunk_text,
            embedding.tolist(),
            model_name
        ))


print("Number of records:", len(records))

for record in records:
    print(
        "Paper:", record[0],
        "| Chunk:", record[1],
        "| Text length:", len(record[2]),
        "| Embedding dimensions:", len(record[3]),
        "| Model:", record[4]
    )



## Insert into database 
# 1. Load database credentials
PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = PROJECT_ROOT / "backend" / ".env"

load_dotenv(ENV_PATH)

DB_CONFIG = {
    "host": os.environ["SUPABASE_HOST"],
    "port": os.environ["SUPABASE_PORT"],
    "dbname": os.environ["SUPABASE_DB"],
    "user": os.environ["SUPABASE_USER"],
    "password": os.environ["SUPABASE_PASSWORD"],
    "sslmode": os.getenv("SUPABASE_SSLMODE", "require"),
    "connect_timeout": 15,
}


# 2. Prepare the insertion query
insert_sql = """
    INSERT INTO public.paper_embedding_chunks (
        paper_id,
        chunk_index,
        chunk_text,
        embedding,
        model_name
    )
    VALUES (%s, %s, %s, %s::extensions.vector, %s)
    ON CONFLICT (paper_id, chunk_index, model_name)
    DO UPDATE SET
        chunk_text = EXCLUDED.chunk_text,
        embedding = EXCLUDED.embedding;
"""


# 3. Connect and insert records
conn = None

try:
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False

    print("\nConnected to Supabase PostgreSQL")

    with conn.cursor() as cursor:
        cursor.execute("SELECT current_user;")
        print("Database role:", cursor.fetchone()[0])

        for record in records:
            paper_id, chunk_index, chunk_text, embedding, model_name = record

            assert len(embedding) == 384

            # Convert Python list to pgvector string
            vector_string = "[" + ",".join(map(str, embedding)) + "]"

            cursor.execute(
                insert_sql,
                (
                    paper_id,
                    chunk_index,
                    chunk_text,
                    vector_string,
                    model_name,
                ),
            )

            print(f"Inserted/updated chunk {chunk_index}")

    # Commit only after all records succeed
    conn.commit()
    print("\nTransaction committed successfully")

    # 4. Verify stored records
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT
                paper_id,
                chunk_index,
                extensions.vector_dims(embedding)
            FROM public.paper_embedding_chunks
            WHERE paper_id = %s AND model_name = %s
            ORDER BY chunk_index;
            """,
            (paper_data[0]["paper_id"], model_name),
        )

        rows = cursor.fetchall()

        print("\nStored embeddings:")
        for paper_id, chunk_index, dimensions in rows:
            print(
                f"Paper: {paper_id} | "
                f"Chunk: {chunk_index} | "
                f"Dimensions: {dimensions}"
            )


    ## Testing natural language query search

    search_sqlquery = """
        SELECT
            paper_id,
            chunk_index,
            1 - (embedding <=> %s::extensions.vector) AS similarity
        FROM public.paper_embedding_chunks
        WHERE model_name = %s
        ORDER BY embedding <=> %s::extensions.vector
        LIMIT 3;
    """

    query = (
        "Why were diagnosis labels copied from a single patient admission "
        "to radiographs from other admissions?"
    )

    query_embeddings = model.encode_query(query, normalize_embeddings=True)
    # Convert Python list to pgvector string
    vector_string = "[" + ",".join(map(str, query_embeddings)) + "]"

    with conn.cursor() as cursor:
        cursor.execute(
            search_sqlquery, 
            (vector_string, model_name, vector_string)
        )

        rows = cursor.fetchall()

        print("Simiarlarity Results: ")
        for paper_id, chunk_index, similarity in rows:
            print(
                f"Paper: {paper_id} | "
                f"Chunk: {chunk_index} | "
                f"Similarity: {similarity}"
            )


except Exception as exc:
    if conn is not None:
        conn.rollback()

    print(f"\nDatabase error: {exc}")
    raise

finally:
    if conn is not None:
        conn.close()
        print("\nDatabase connection closed")

