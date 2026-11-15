import { EvidenceDrawer } from "../components/papers/EvidenceDrawer";
import { observationEvidence } from "../utils/evidenceContext";
import type { EvidenceContext } from "../utils/evidenceContext";
import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TopicPrevalenceChange } from "../components/intelligence/TopicPrevalenceChange";
import { TopicCategoryHeatmap } from "../components/intelligence/TopicCategoryHeatmap";
import { MomentumMatrix } from "../components/intelligence/MomentumMatrix";
import { ResearchRelationships } from "../components/intelligence/ResearchRelationships";
import { ResearchMomentum } from "../components/intelligence/ResearchMomentum";
import { CoverageSummary } from "../components/intelligence/CoverageSummary";
import { IntelligenceFilters } from "../components/intelligence/IntelligenceFilters";
import {
  IntelligenceEmpty,
  IntelligenceError,
  IntelligenceLoading,
} from "../components/intelligence/IntelligenceState";
import { PageContainer } from "../components/layout/PageContainer";
import { AnalyticalNavigation } from "../components/intelligence/AnalyticalNavigation";
import { useIntelligenceCoverage, useIntelligenceTopics } from "../hooks/useIntelligence";
import {
  parseIntelligenceFilters,
  resolveIntelligenceDates,
  serializeIntelligenceFilters,
  utcToday,
} from "../utils/intelligenceFilters";
import "../styles/intelligence.css";

export function IntelligencePage() {
  const [search, setSearch] = useSearchParams();
  const [evidence, setEvidence] = useState<EvidenceContext | null>(null);
  const evidenceTriggerRef = useRef<HTMLElement | SVGElement | null>(null);
  const closeEvidence = useCallback(() => setEvidence(null), []);
  const [today] = useState(() => utcToday());
  const coverage = useIntelligenceCoverage();
  // Resolve URL dates against observed warehouse bounds.
  const preliminary = parseIntelligenceFilters(search).filters;
  const dates = resolveIntelligenceDates(preliminary, coverage.data?.data, today);
  const topics = useIntelligenceTopics({ date_from: dates.date_from, date_to: dates.date_to });
  const { filters, notices } = parseIntelligenceFilters(search, topics.data?.data);

  return (
    <PageContainer>
      <div
        className="intelligence-page"
        onClickCapture={(event) => {
          evidenceTriggerRef.current = (event.target as Element).closest<HTMLElement>(
            "button, a, [tabindex]",
          );
        }}
        onKeyDownCapture={(event) => {
          if (event.key === "Enter" || event.key === " ")
            evidenceTriggerRef.current = document.activeElement as HTMLElement | SVGElement;
        }}
      >
        <header className="intelligence-introduction">
          <h1>Research Intelligence</h1>
          <p>Explore research momentum, emerging topics, and connections.</p>
        </header>
        <AnalyticalNavigation />
        <CoverageSummary
          data={coverage.data}
          error={coverage.error}
          errorUpdatedAt={coverage.errorUpdatedAt}
          isPending={coverage.isPending}
          isFetching={coverage.isFetching}
          onRetry={() => void coverage.refetch()}
        />
        {notices.length ? (
          <div className="intelligence-url-notice" role="status">
            {notices.map((notice) => (
              <p key={notice}>{notice}</p>
            ))}
          </div>
        ) : null}
        <IntelligenceFilters
          filters={filters}
          dates={dates}
          topics={topics.data?.data}
          onChange={(next) => setSearch(serializeIntelligenceFilters(next))}
        />
        {topics.isPending ? <IntelligenceLoading label="Loading research topics…" /> : null}
        {topics.error ? (
          <IntelligenceError
            key={topics.errorUpdatedAt}
            error={topics.error}
            label="topics"
            onRetry={() => void topics.refetch()}
          />
        ) : null}
        {topics.data && topics.data.data.length === 0 ? (
          <IntelligenceEmpty
            title="No configured topics"
            description="Research topics are not currently available. Coverage information remains available above."
          />
        ) : null}
        <section
          id="research-momentum"
          className="executive-panel intelligence-section momentum-section"
          aria-label="Research Momentum"
          tabIndex={-1}
        >
          <ResearchMomentum
            onSelectPoint={(selection) => setEvidence(observationEvidence("momentum", selection))}
            heading={{
              title: "Research Momentum",
              description: "How is publication activity evolving?",
            }}
            dates={dates}
            topicIds={filters.topicIds}
            topicsReady={!!topics.data?.data.length && !topics.error}
          />
        </section>
        <section
          id="momentum-matrix"
          aria-label="Momentum Matrix"
          className="executive-panel intelligence-section"
          tabIndex={-1}
        >
          <MomentumMatrix
            onSelectWindow={(selection) => setEvidence(observationEvidence("matrix", selection))}
            heading={{
              title: "Momentum Matrix",
              description: "Which topics are growing fastest, and at what scale?",
            }}
            dates={dates}
            topicIds={filters.topicIds}
            topicsReady={!!topics.data?.data.length && !topics.error}
          />
        </section>
        <section
          id="topic-prevalence-change"
          aria-label="Topic Prevalence Change"
          className="executive-panel intelligence-section"
          tabIndex={-1}
        >
          <TopicPrevalenceChange
            onSelectWindow={(selection) =>
              setEvidence(observationEvidence("prevalence", selection))
            }
            onSelectPoint={(selection) =>
              setEvidence(observationEvidence("composition", selection))
            }
            heading={{
              title: "Topic Prevalence Change",
              description: "Which topics are gaining or losing relative prominence?",
            }}
            dates={dates}
            topicIds={filters.topicIds}
            topicsReady={!!topics.data?.data.length && !topics.error}
          />
        </section>
        <section
          id="research-relationships"
          aria-label="Research Relationships"
          className="executive-panel intelligence-section"
          tabIndex={-1}
        >
          <ResearchRelationships
            onSelectItem={(selection) =>
              setEvidence(observationEvidence("relationships", selection))
            }
            heading={{
              title: "Research Relationships",
              description: "Which research topics frequently appear together?",
            }}
            dates={dates}
            topicIds={filters.topicIds}
            topicsReady={!!topics.data?.data.length && !topics.error}
          />
        </section>
        <section
          id="topic-category-heatmap"
          aria-label="Topic–Category Heatmap"
          className="executive-panel intelligence-section"
          tabIndex={-1}
        >
          <TopicCategoryHeatmap
            onSelectCell={(selection) => setEvidence(observationEvidence("heatmap", selection))}
            heading={{
              title: "Topic–Category Heatmap",
              description: "Where is research concentrated across topics and arXiv categories?",
            }}
            dates={dates}
            topicIds={filters.topicIds}
            topicsReady={!!topics.data?.data.length && !topics.error}
          />
        </section>
      </div>
      {evidence ? (
        <EvidenceDrawer
          key={JSON.stringify(evidence)}
          context={evidence}
          topics={topics.data?.data}
          onClose={closeEvidence}
          returnFocusRef={evidenceTriggerRef}
        />
      ) : null}
    </PageContainer>
  );
}
