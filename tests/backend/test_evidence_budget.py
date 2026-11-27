
from copy import deepcopy

import pytest

from backend.app.services.evidence.evidence_budget import (
    DEFAULT_RECOMMENDATION_LIMIT,
    format_evidence,
    pack_primary_evidence,
    select_recommendations,
    build_source_registry,
    build_evidence_context,
)


def count_tokens(text: str) -> int:
    """Deterministic mock tokenizer."""
    return len(text.split())


def make_paper(
    index: int,
    abstract: str = "This paper investigates machine learning.",
) -> dict:
    return {
        "paper_id": f"2610.{index:05d}v1",
        "title": f"Research Paper {index}",
        "abstract": abstract,
        "arxiv_url": f"https://arxiv.org/abs/2610.{index:05d}v1",
        "pdf_url": f"https://arxiv.org/pdf/2610.{index:05d}v1",
        "selection_rank": index,
        "retrieval_rank": index + 2,
        "chunk_index": 1,
        "chunk_text": "Matching evidence chunk.",
        "similarity": 0.75,
        "rrf_score": 0.025,
        "lexical_rank": index,
        "semantic_rank": index + 1,
    }


@pytest.fixture
def papers():
    return [make_paper(i) for i in range(1, 6)]


@pytest.fixture
def assembly_result(papers):
    return {
        "query": "What are the limitations of diffusion policies?",
        "selected_evidence": papers[:3],
        "remaining_candidates": papers[3:],
    }


# ============================================================
# Evidence formatting
# ============================================================


class TestFormatEvidence:

    def test_contains_source_identifier(self):
        result = format_evidence(make_paper(1), "S1")

        assert result.startswith("[S1]\n")

    def test_contains_required_content(self):
        paper = make_paper(1)
        result = format_evidence(paper, "S1")

        assert f"Paper ID: {paper['paper_id']}" in result
        assert f"Title: {paper['title']}" in result
        assert f"Abstract: {paper['abstract']}" in result

    def test_excludes_internal_retrieval_metadata(self):
        result = format_evidence(make_paper(1), "S1")

        for field in (
            "chunk_text",
            "chunk_index",
            "rrf_score",
            "similarity",
            "retrieval_rank",
            "selection_rank",
        ):
            assert field not in result

        assert "Matching evidence chunk." not in result

    def test_preserves_complete_abstract(self):
        abstract = "First paragraph.\n\nSecond paragraph."
        paper = make_paper(1, abstract=abstract)

        result = format_evidence(paper, "S1")

        assert abstract in result

    def test_does_not_mutate_input(self):
        paper = make_paper(1)
        original = deepcopy(paper)

        format_evidence(paper, "S1")

        assert paper == original


# ============================================================
# Primary evidence packing
# ============================================================


class TestPackPrimaryEvidence:

    def test_empty_input(self):
        result = pack_primary_evidence([], 100, count_tokens)

        assert result == {
            "included_papers": [],
            "overflow_papers": [],
            "context": "",
            "tokens_used": 0,
            "unused_budget": 100,
        }

    def test_negative_budget(self, papers):
        with pytest.raises(ValueError):
            pack_primary_evidence(papers, -1, count_tokens)

    def test_zero_budget(self, papers):
        result = pack_primary_evidence(papers, 0, count_tokens)

        assert result["included_papers"] == []
        assert result["overflow_papers"] == papers
        assert result["context"] == ""
        assert result["tokens_used"] == 0
        assert result["unused_budget"] == 0

    def test_all_papers_fit(self, papers):
        result = pack_primary_evidence(
            papers, 10_000, count_tokens
        )

        assert len(result["included_papers"]) == len(papers)
        assert result["overflow_papers"] == []

    def test_exact_budget_boundary(self):
        paper = make_paper(1)
        budget = count_tokens(format_evidence(paper, "S1"))

        result = pack_primary_evidence(
            [paper], budget, count_tokens
        )

        assert len(result["included_papers"]) == 1
        assert result["tokens_used"] == budget
        assert result["unused_budget"] == 0

    def test_one_token_below_required_budget(self):
        paper = make_paper(1)
        budget = count_tokens(format_evidence(paper, "S1")) - 1

        result = pack_primary_evidence(
            [paper], budget, count_tokens
        )

        assert result["included_papers"] == []
        assert result["overflow_papers"] == [paper]

    def test_skips_oversized_paper_and_continues(self):
        oversized = make_paper(1, abstract="word " * 1000)
        small = make_paper(2)

        budget = count_tokens(format_evidence(small, "S1"))

        result = pack_primary_evidence(
            [oversized, small], budget, count_tokens
        )

        assert result["overflow_papers"] == [oversized]
        assert len(result["included_papers"]) == 1
        assert (
            result["included_papers"][0]["paper_id"]
            == small["paper_id"]
        )

    def test_source_ids_are_contiguous(self):
        first = make_paper(1)
        oversized = make_paper(2, abstract="word " * 1000)
        third = make_paper(3)

        result = pack_primary_evidence(
            [first, oversized, third],
            100,
            count_tokens,
        )

        assert [
            paper["source_id"]
            for paper in result["included_papers"]
        ] == ["S1", "S2"]

    def test_preserves_included_paper_order(self, papers):
        result = pack_primary_evidence(
            papers, 10_000, count_tokens
        )

        assert [
            paper["paper_id"]
            for paper in result["included_papers"]
        ] == [paper["paper_id"] for paper in papers]

    def test_preserves_overflow_order(self, papers):
        result = pack_primary_evidence(
            papers, 0, count_tokens
        )

        assert result["overflow_papers"] == papers

    def test_context_matches_included_papers(self, papers):
        result = pack_primary_evidence(
            papers, 10_000, count_tokens
        )

        expected = "\n\n".join(
            format_evidence(paper, paper["source_id"])
            for paper in result["included_papers"]
        )

        assert result["context"] == expected

    def test_overflow_not_present_in_context(self):
        oversized = make_paper(
            1, abstract="UNIQUE_OVERFLOW_TEXT " * 1000
        )
        small = make_paper(2)

        result = pack_primary_evidence(
            [oversized, small], 100, count_tokens
        )

        assert oversized["paper_id"] not in result["context"]
        assert "UNIQUE_OVERFLOW_TEXT" not in result["context"]

    def test_token_accounting(self, papers):
        budget = 50

        result = pack_primary_evidence(
            papers, budget, count_tokens
        )

        assert result["tokens_used"] == count_tokens(
            result["context"]
        )
        assert result["tokens_used"] <= budget
        assert (
            result["tokens_used"] + result["unused_budget"]
            == budget
        )

    def test_counts_actual_combined_context(self):
        # Character counter deliberately charges for separators.
        # This catches implementations that only sum block costs.
        first = make_paper(1)
        second = make_paper(2)

        first_block = format_evidence(first, "S1")
        second_block = format_evidence(second, "S2")

        budget = len(first_block) + len(second_block)

        result = pack_primary_evidence(
            [first, second], budget, len
        )

        assert len(result["included_papers"]) == 1
        assert result["overflow_papers"] == [second]
        assert result["tokens_used"] == len(result["context"])

    def test_exact_combined_context_boundary(self):
        papers = [make_paper(1), make_paper(2)]

        expected_context = "\n\n".join(
            format_evidence(paper, f"S{i}")
            for i, paper in enumerate(papers, start=1)
        )

        result = pack_primary_evidence(
            papers, len(expected_context), len
        )

        assert len(result["included_papers"]) == 2
        assert result["context"] == expected_context
        assert result["unused_budget"] == 0

    def test_every_paper_is_included_or_overflow(self, papers):
        result = pack_primary_evidence(
            papers, 30, count_tokens
        )

        included_ids = {
            paper["paper_id"]
            for paper in result["included_papers"]
        }

        overflow_ids = {
            paper["paper_id"]
            for paper in result["overflow_papers"]
        }

        original_ids = {paper["paper_id"] for paper in papers}

        assert included_ids.isdisjoint(overflow_ids)
        assert included_ids | overflow_ids == original_ids

    def test_does_not_mutate_input(self, papers):
        original = deepcopy(papers)

        pack_primary_evidence(papers, 50, count_tokens)

        assert papers == original

    def test_deterministic_output(self, papers):
        first = pack_primary_evidence(
            papers, 50, count_tokens
        )
        second = pack_primary_evidence(
            papers, 50, count_tokens
        )

        assert first == second


# ============================================================
# Recommendation selection
# ============================================================


class TestSelectRecommendations:

    def test_empty_input(self):
        assert select_recommendations([]) == []

    def test_negative_limit(self, papers):
        with pytest.raises(ValueError):
            select_recommendations(papers, -1)

    def test_zero_limit(self, papers):
        assert select_recommendations(papers, 0) == []

    def test_respects_limit(self, papers):
        result = select_recommendations(papers, 2)

        assert len(result) == 2
        assert result == papers[:2]

    def test_limit_exceeds_available_papers(self, papers):
        assert select_recommendations(papers, 100) == papers

    def test_default_limit(self):
        papers = [make_paper(i) for i in range(1, 21)]

        result = select_recommendations(papers)

        assert result == papers[:DEFAULT_RECOMMENDATION_LIMIT]

    def test_does_not_mutate_input(self, papers):
        original = deepcopy(papers)

        select_recommendations(papers, 2)

        assert papers == original

    def test_returns_new_list(self, papers):
        result = select_recommendations(papers, 100)

        assert result is not papers


# ============================================================
# Source registry
# ============================================================


class TestBuildSourceRegistry:

    @pytest.fixture
    def included_papers(self, papers):
        return [
            {**paper, "source_id": f"S{i}"}
            for i, paper in enumerate(papers, start=1)
        ]

    def test_empty_registry(self):
        assert build_source_registry([]) == {}

    def test_registry_keys_match_source_ids(self, included_papers):
        registry = build_source_registry(included_papers)

        assert list(registry) == [
            paper["source_id"] for paper in included_papers
        ]

    def test_exact_registry_schema(self, included_papers):
        registry = build_source_registry(included_papers)

        expected_fields = {
            "paper_id",
            "title",
            "arxiv_url",
            "pdf_url",
            "selection_rank",
            "retrieval_rank",
            "chunk_index",
            "similarity",
        }

        for entry in registry.values():
            assert set(entry) == expected_fields

    def test_preserves_metadata_and_provenance(self, included_papers):
        registry = build_source_registry(included_papers)

        for paper in included_papers:
            entry = registry[paper["source_id"]]

            for key, value in entry.items():
                assert value == paper[key]

    def test_preserves_versioned_paper_id(self, included_papers):
        included_papers[0]["paper_id"] = "2610.00001v3"

        registry = build_source_registry(included_papers)

        assert registry["S1"]["paper_id"] == "2610.00001v3"

    @pytest.mark.parametrize(
        "missing_field",
        [
            "source_id",
            "paper_id",
            "title",
            "arxiv_url",
            "pdf_url",
            "selection_rank",
            "retrieval_rank",
            "chunk_index",
            "similarity",
        ],
    )
    def test_missing_required_field(
        self, included_papers, missing_field
    ):
        del included_papers[0][missing_field]

        with pytest.raises(KeyError):
            build_source_registry(included_papers)

    def test_validates_later_papers(self, included_papers):
        del included_papers[-1]["similarity"]

        with pytest.raises(KeyError):
            build_source_registry(included_papers)

    def test_excludes_internal_fields(self, included_papers):
        registry = build_source_registry(included_papers)

        excluded = {
            "abstract",
            "chunk_text",
            "source_id",
            "rrf_score",
            "lexical_rank",
            "semantic_rank",
        }

        for entry in registry.values():
            assert excluded.isdisjoint(entry)

    def test_registry_entries_are_independent(self, included_papers):
        registry = build_source_registry(included_papers)

        original_title = included_papers[0]["title"]
        registry["S1"]["title"] = "Modified title"

        assert included_papers[0]["title"] == original_title

    def test_does_not_mutate_input(self, included_papers):
        original = deepcopy(included_papers)

        build_source_registry(included_papers)

        assert included_papers == original


# ============================================================
# Context orchestration
# ============================================================


class TestBuildEvidenceContext:

    def test_return_structure(self, assembly_result):
        result = build_evidence_context(
            assembly_result, 1000, count_tokens
        )

        assert set(result) == {
            "query",
            "primary",
            "recommendations",
            "source_registry",
        }

    def test_preserves_query(self, assembly_result):
        result = build_evidence_context(
            assembly_result, 1000, count_tokens
        )

        assert result["query"] == assembly_result["query"]

    def test_all_evidence_fits(self, assembly_result):
        result = build_evidence_context(
            assembly_result, 1000, count_tokens
        )

        assert len(result["primary"]["included_papers"]) == 3
        assert result["primary"]["overflow_papers"] == []
        assert (
            result["recommendations"]
            == assembly_result["remaining_candidates"]
        )

    def test_entire_budget_available_to_primary(self, assembly_result):
        budget = count_tokens(
            "\n\n".join(
                format_evidence(paper, f"S{i}")
                for i, paper in enumerate(
                    assembly_result["selected_evidence"],
                    start=1,
                )
            )
        )

        result = build_evidence_context(
            assembly_result, budget, count_tokens
        )

        assert len(result["primary"]["included_papers"]) == 3
        assert result["primary"]["unused_budget"] == 0
        assert len(result["recommendations"]) == 2

    def test_overflow_has_recommendation_priority(self):
        oversized = make_paper(
            1, abstract="word " * 1000
        )
        small = make_paper(2)
        remaining = make_paper(3)

        assembly = {
            "query": "Research question",
            "selected_evidence": [oversized, small],
            "remaining_candidates": [remaining],
        }

        budget = count_tokens(format_evidence(small, "S1"))

        result = build_evidence_context(
            assembly, budget, count_tokens
        )

        assert result["recommendations"] == [
            oversized,
            remaining,
        ]

    def test_recommendation_limit_applied_after_pooling(
        self, assembly_result
    ):
        result = build_evidence_context(
            assembly_result,
            0,
            count_tokens,
            recommendation_limit=2,
        )

        assert (
            result["recommendations"]
            == assembly_result["selected_evidence"][:2]
        )

    def test_recommendations_can_be_disabled(self, assembly_result):
        result = build_evidence_context(
            assembly_result,
            1000,
            count_tokens,
            recommendation_limit=0,
        )

        assert result["recommendations"] == []
        assert len(result["primary"]["included_papers"]) == 3

    def test_negative_recommendation_limit(self, assembly_result):
        with pytest.raises(ValueError):
            build_evidence_context(
                assembly_result,
                1000,
                count_tokens,
                recommendation_limit=-1,
            )

    def test_negative_total_budget(self, assembly_result):
        with pytest.raises(ValueError):
            build_evidence_context(
                assembly_result, -1, count_tokens
            )

    def test_zero_total_budget(self, assembly_result):
        result = build_evidence_context(
            assembly_result, 0, count_tokens
        )

        assert result["primary"]["included_papers"] == []
        assert result["primary"]["context"] == ""
        assert result["source_registry"] == {}

        expected = (
            assembly_result["selected_evidence"]
            + assembly_result["remaining_candidates"]
        )

        assert result["recommendations"] == (
            expected[:DEFAULT_RECOMMENDATION_LIMIT]
        )

    def test_empty_assembly(self):
        assembly = {
            "query": "Research question",
            "selected_evidence": [],
            "remaining_candidates": [],
        }

        result = build_evidence_context(
            assembly, 100, count_tokens
        )

        assert result["primary"]["context"] == ""
        assert result["primary"]["tokens_used"] == 0
        assert result["primary"]["unused_budget"] == 100
        assert result["recommendations"] == []
        assert result["source_registry"] == {}

    def test_no_selected_evidence_but_remaining_candidates(
        self, papers
    ):
        assembly = {
            "query": "Research question",
            "selected_evidence": [],
            "remaining_candidates": papers,
        }

        result = build_evidence_context(
            assembly, 100, count_tokens
        )

        assert result["primary"]["included_papers"] == []
        assert result["source_registry"] == {}
        assert result["recommendations"] == (
            papers[:DEFAULT_RECOMMENDATION_LIMIT]
        )

    def test_registry_contains_only_included_evidence(
        self, assembly_result
    ):
        result = build_evidence_context(
            assembly_result, 20, count_tokens
        )

        included_ids = {
            paper["paper_id"]
            for paper in result["primary"]["included_papers"]
        }

        registry_ids = {
            paper["paper_id"]
            for paper in result["source_registry"].values()
        }

        assert registry_ids == included_ids

    def test_recommendations_disjoint_from_primary(
        self, assembly_result
    ):
        result = build_evidence_context(
            assembly_result, 20, count_tokens
        )

        primary_ids = {
            paper["paper_id"]
            for paper in result["primary"]["included_papers"]
        }

        recommendation_ids = {
            paper["paper_id"]
            for paper in result["recommendations"]
        }

        assert primary_ids.isdisjoint(recommendation_ids)

    def test_recommendations_not_in_llm_context(
        self, assembly_result
    ):
        result = build_evidence_context(
            assembly_result, 20, count_tokens
        )

        for paper in result["recommendations"]:
            assert (
                paper["paper_id"]
                not in result["primary"]["context"]
            )

    def test_recommendations_do_not_consume_tokens(
        self, assembly_result
    ):
        without_recommendations = build_evidence_context(
            assembly_result,
            1000,
            count_tokens,
            recommendation_limit=0,
        )

        with_recommendations = build_evidence_context(
            assembly_result,
            1000,
            count_tokens,
            recommendation_limit=5,
        )

        assert (
            without_recommendations["primary"]
            == with_recommendations["primary"]
        )

        assert (
            without_recommendations["source_registry"]
            == with_recommendations["source_registry"]
        )

    def test_budget_never_exceeded(self, assembly_result):
        for budget in (0, 1, 10, 20, 50, 100, 1000):
            result = build_evidence_context(
                assembly_result, budget, count_tokens
            )

            primary = result["primary"]

            assert primary["tokens_used"] <= budget
            assert primary["tokens_used"] == count_tokens(
                primary["context"]
            )

    def test_does_not_mutate_assembly_result(
        self, assembly_result
    ):
        original = deepcopy(assembly_result)

        build_evidence_context(
            assembly_result, 20, count_tokens
        )

        assert assembly_result == original

    def test_deterministic_output(self, assembly_result):
        first = build_evidence_context(
            assembly_result, 50, count_tokens
        )

        second = build_evidence_context(
            assembly_result, 50, count_tokens
        )

        assert first == second
