
"""Incrementally index research papers for semantic retrieval."""

import argparse
from collections import defaultdict

import psycopg2
from psycopg2.extras import execute_values
from sentence_transformers import SentenceTransformer

from database.embedding_config import (
    CHUNK_OVERLAP,
    CHUNK_TOKEN_TARGET,
    INDEX_ID,
    MODEL_NAME,
    NORMALIZE_EMBEDDINGS,
)
from etl.config import get_database_config


def chunk_paper(paper, tokenizer, max_seq_length):
    """Create overlapping chunks within the model's token limit."""

    title = (paper['title'] or "").strip()
    abstract = (paper['abstract'] or "").strip()

    if not title:
        return []

    prefix = f"{title}\n\n" if title else ""

    prefix_tokens = len(
        tokenizer.encode(prefix, add_special_tokens=True)
    )

    budget = min(
        CHUNK_TOKEN_TARGET,
        max_seq_length - prefix_tokens - 2
    )

    if budget <= CHUNK_OVERLAP:
        raise ValueError(
            f"Paper {paper["paper_id"]} has an excessively long title"
        )

    abstract_tokens = tokenizer.encode(abstract, add_special_tokens=False)

    if not abstract_tokens:
        return [title] if title else []

    chunks = []
    step = budget - CHUNK_OVERLAP

    for start in range(0, len(abstract_tokens), step):
        token_slice = abstract_tokens[start:start + budget]

        while token_slice:
            text = prefix + tokenizer.decode(
                token_slice,
                skip_special_tokens=True
            )

            count = len(
                tokenizer.encode(text, add_special_tokens=True)
            )

            if count <= max_seq_length:
                break

            token_slice = token_slice[:-1]

        if not token_slice:
            raise ValueError(
                f"Unable to chunk paper {paper['paper_id']}"
            )

        chunks.append(text)

        if start + budget >= len(abstract_tokens):
            break

    return chunks

def fetch_papers(conn, limit):
    sql = """
        SELECT paper_id, title, abstract
        FROM public.fact_papers
        ORDER BY paper_id
    """

    params = ()

    if limit is not None:
        sql += " LIMIT %s"
        params = (limit,)

    with conn.cursor() as cursor:
        cursor.execute(sql, params)
        rows = cursor.fetchall()

    return [
        {
            "paper_id": row[0],
            "title": row[1],
            "abstract": row[2],
        }
        for row in rows
    ]


def fetch_existing_chunks(conn, paper_ids):
    """Read stored chunk text to detect changed content."""

    existing = defaultdict(dict)

    with conn.cursor() as cursor:
        cursor.execute(
            """
                SELECT 
                    paper_id,
                    chunk_index,
                    chunk_text
                FROM public.paper_embedding_chunks
                WHERE model_name = %s
                    AND paper_id = ANY(%s)
            """,
            (INDEX_ID, paper_ids)
        )

        for paper_id, chunk_index, chunk_text in cursor.fetchall():
            existing[paper_id][chunk_index] = chunk_text

    return existing


def save_batch_chunks(conn, batch, embeddings):
    """Upsert chunks and remove obsolete chunks for a batch of papers."""

    rows = []
    embedding_iter = iter(embeddings)

    for paper in batch:
        paper_id = paper["paper_id"]

        for chunk_index, chunk_text in enumerate(paper["chunks"]):
            embedding = next(embedding_iter)
            vector_string = "[" + ",".join(
                map(str, embedding.tolist())
            ) + "]"

            rows.append((
                paper_id,
                chunk_index,
                chunk_text,
                vector_string,
                INDEX_ID,
            ))

    with conn.cursor() as cursor:
        if rows:
            execute_values(
                cursor,
                """
                INSERT INTO public.paper_embedding_chunks (
                    paper_id,
                    chunk_index,
                    chunk_text,
                    embedding,
                    model_name
                )
                VALUES %s
                ON CONFLICT (paper_id, chunk_index, model_name)
                DO UPDATE SET
                    chunk_text = EXCLUDED.chunk_text,
                    embedding = EXCLUDED.embedding
                """,
                rows,
                template="(%s, %s, %s, %s::extensions.vector, %s)",
                page_size=500,
            )

        delete_rows = [
            (paper["paper_id"], INDEX_ID, len(paper["chunks"]))
            for paper in batch
        ]

        execute_values(
            cursor,
            """
            DELETE FROM public.paper_embedding_chunks AS stored
            USING (VALUES %s)
                AS expected(paper_id, model_name, chunk_count)
            WHERE stored.paper_id = expected.paper_id
              AND stored.model_name = expected.model_name
              AND stored.chunk_index >= expected.chunk_count
            """,
            delete_rows,
            page_size=500,
        )


def write_batch(conn, model, batch):
    """Encode and atomically commit a batch of changed papers."""

    all_chunks = [
        chunk
        for paper in batch
        for chunk in paper["chunks"]
    ]

    try:
        embeddings = (
            model.encode_document(
                all_chunks,
                normalize_embeddings=NORMALIZE_EMBEDDINGS,
                batch_size=32,
            )
            if all_chunks
            else []
        )

        save_batch_chunks(conn, batch, embeddings)
        conn.commit()

    except Exception:
        try:
            conn.rollback()
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            pass
        raise

    return len(all_chunks)



def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()

    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")

    if args.batch_size < 1:
        parser.error("--batch-size must be positive")

    print(f"Loading embedding model {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)
    tokenizer = model.tokenizer

    conn = psycopg2.connect(
        **get_database_config(),
        sslmode="require",
        connect_timeout=15,
    )

    indexed = 0
    skipped = 0
    chunks_generated = 0
    pending = []

    try:
        papers = fetch_papers(conn, args.limit)
        paper_ids = [paper["paper_id"] for paper in papers]

        existing = (
            fetch_existing_chunks(conn, paper_ids)
            if paper_ids
            else {}
        )

        print(f"Papers selected: {len(papers)}")
        print(f"Dry run: {args.dry_run}")
        print(f"Batch size: {args.batch_size}")

        for paper in papers:
            paper_id = paper["paper_id"]

            chunks = chunk_paper(
                paper,
                tokenizer,
                model.max_seq_length,
            )

            current = existing.get(paper_id, {})
            expected = {
                index: chunk
                for index, chunk in enumerate(chunks)
            }

            if current == expected:
                skipped += 1
                continue

            if args.dry_run:
                print(
                    f"[WOULD INDEX] {paper_id}: "
                    f"{len(chunks)} chunks"
                )
                indexed += 1
                chunks_generated += len(chunks)
                continue

            pending.append({
                "paper_id": paper_id,
                "chunks": chunks,
            })

            if len(pending) >= args.batch_size:
                batch_chunks = write_batch(conn, model, pending)

                indexed += len(pending)
                chunks_generated += batch_chunks

                print(
                    f"[BATCH COMMITTED] "
                    f"{len(pending)} papers, "
                    f"{batch_chunks} chunks | "
                    f"Total indexed: {indexed}"
                )

                pending.clear()

        if pending:
            batch_chunks = write_batch(conn, model, pending)

            indexed += len(pending)
            chunks_generated += batch_chunks

            print(
                f"[BATCH COMMITTED] "
                f"{len(pending)} papers, "
                f"{batch_chunks} chunks | "
                f"Total indexed: {indexed}"
            )

            pending.clear()

        print("\nIndexing summary")
        print("----------------")
        print(f"Papers examined: {len(papers)}")
        print(f"Papers needing indexing: {indexed}")
        print(f"Papers already up to date: {skipped}")
        print(f"Chunks requiring embeddings: {chunks_generated}")

        if args.dry_run:
            print("No database changes made.")

    finally:
        conn.close()


if __name__ == "__main__":
    main()