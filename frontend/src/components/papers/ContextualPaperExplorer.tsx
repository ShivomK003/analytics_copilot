import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useIntelligenceTopics } from "../../hooks/useIntelligence";
import { evidenceSortOptions, parseEvidenceContext } from "../../utils/evidenceContext";
import type { EvidenceSort } from "../../types/intelligence";
import { PageContainer } from "../layout/PageContainer";
import { PageHeader } from "../layout/PageHeader";
import { EvidenceResults } from "./EvidenceResults";
import { EvidenceSummary } from "./EvidenceSummary";
import { PaperSearchToolbar } from "./PaperSearchToolbar";
import "../../styles/paperDiscovery.css";

function refinementParams(params: URLSearchParams, q: string, sort: string) {
  const next = new URLSearchParams(params);
  if (q.trim()) next.set("q", q.trim());
  else next.delete("q");
  if (sort !== "published_desc") next.set("sort", sort);
  else next.delete("sort");
  next.delete("page");
  return next;
}

export function ContextualPaperExplorer() {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const { context, page, refinement, error } = parseEvidenceContext(params);
  const q = refinement?.q ?? "";
  const sort = refinement?.sort ?? "published_desc";
  const scopeKey = JSON.stringify(context);
  const [draft, setDraft] = useState({ committed: q, scopeKey, value: q });
  if (draft.committed !== q || draft.scopeKey !== scopeKey) {
    setDraft({ committed: q, scopeKey, value: q });
  }
  const topics = useIntelligenceTopics();

  useEffect(() => {
    if (error || !scopeKey || draft.value.trim() === q) return;
    const timer = window.setTimeout(() => {
      setParams(refinementParams(params, draft.value, sort));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft.value, q, sort, scopeKey, params, setParams, error]);

  function refine(keyword: string, ordering: EvidenceSort) {
    setParams(refinementParams(params, keyword, ordering));
  }
  function changePage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete("page");
    else next.set("page", String(nextPage));
    setParams(next);
  }
  return (
    <PageContainer>
      <PageHeader
        title="Paper Explorer"
        description="Investigate supporting publications from Research Intelligence."
      />
      <section className="imported-evidence-context" aria-label="Imported analytical context">
        <div className="imported-context-heading">
          {context ? (
            <EvidenceSummary context={context} topics={topics.data?.data} compact />
          ) : (
            <p role="alert">{error}</p>
          )}
          <button type="button" className="button button-secondary" onClick={() => setParams({})}>
            Clear imported context
          </button>
        </div>
      </section>
      {context ? (
        <>
          <PaperSearchToolbar
            searchLabel="Search supporting publications"
            value={draft.value}
            onChange={(value) => setDraft({ ...draft, value })}
            onSubmit={(event) => {
              event.preventDefault();
              refine(draft.value, sort);
            }}
            sort={sort}
            sortOptions={evidenceSortOptions}
            onSortChange={(value) => refine(draft.value, value as EvidenceSort)}
            onClear={() => {
              setDraft({ ...draft, value: "" });
              refine("", sort);
            }}
          />
          <section className="contextual-publications" aria-label="Supporting publications">
            <EvidenceResults
              key={scopeKey}
              context={context}
              page={page}
              refinement={refinement}
              onPageChange={changePage}
            />
          </section>
        </>
      ) : null}
    </PageContainer>
  );
}
