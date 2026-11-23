from sentence_transformers import SentenceTransformer, util

paper_data = [{
    "paper_id": "2611.07950v1",
    "title": "Leakage- and Label-Aware Benchmarking of Class-Imbalance Strategies for Multimodal Chest X-Ray and EHR Classification",
    "abstract": "Benchmarks of class-imbalance strategies for multimodal chest X-ray (CXR) and electronic health record (EHR) prediction are often evaluated on record-level splits of cohorts in which one patient contributes several radiographs. We audit such a benchmark on 29,083 MIMIC-CXR radiographs of 10,479 patients with eight diagnosis targets. First, the record-split benchmark was misleading: a lookup table that copies the label of a development-set radiograph with the same EHR vector nearly matched the best model, and on unseen patients every model fell to the level of predicting every case positive. Second, tracing the labels back to MIMIC-IV explained why: each patient's labels are keyword matches on the diagnosis codes of a single admission, copied, with one EHR vector per patient, to all of the patient's radiographs, so about a third of the radiographs carry labels that differ from the codes of their own admission. Third, under patient-separated evaluation with admission-aligned and rule-refined labels, the initial conclusions do not hold: in the evaluated configurations no imbalance strategy raised the observed mean macro F2 over no augmentation by more than 0.01, tuned tree ensembles showed no consistent advantage over tuned logistic regression, and the released EHR variables stayed at the level of the all-positive baseline, whereas the diagnostic history available at imaging time and image embeddings exceeded it, including, with rule-refined labels, a CheXpert-trained encoder that never saw these radiographs; RAD-DINO had seen 96.6% of them during self-supervised pretraining. Adding either encoder to the diagnostic history gave no statistically significant F2 gain; exploratory AUROC gains were significant with RAD-DINO but not with DenseNet. We provide reusable diagnostics, a leakage-aware protocol and a checklist."
}]


model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
tokenizer = model.tokenizer

for paper in paper_data:
    print(f"For {paper['paper_id']}")
    inputs = tokenizer(paper['abstract'], add_special_tokens=False, truncation=False)
    token_ids = inputs['input_ids']

    chunk_size = 200
    overlap = 30
    step = chunk_size - overlap

    chunks = []
    chunks_ids = []

    for start in range(0, len(token_ids), step):
        chunk_ids = token_ids[start:start+chunk_size]
        chunks_ids.append(chunk_ids)
        chunk_text = tokenizer.decode(
            chunk_ids,
            skip_special_tokens= True
        )
        chunks.append(chunk_text)

        if start + chunk_size >= len(token_ids):
            break

    for chunk in chunks: 
        combined_text = f"{paper['title']}\n{chunk}"
        encoded = tokenizer(
            combined_text,
            add_special_tokens=True,
            truncation=False
        )
        token_count = len(encoded["input_ids"])

        assert token_count <= model.max_seq_length, (
            f"Chunk exceeds model limit: {token_count}"
        )
        
        print(len(encoded["input_ids"]))

    print(chunks_ids[0][-30:] == chunks_ids[1][:30])

