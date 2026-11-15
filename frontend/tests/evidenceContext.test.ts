import { describe, expect, it } from "vitest";
import {
  evidenceExplorerUrl,
  evidenceFilters,
  observationEvidence,
  parseEvidenceContext,
  validateEvidenceContext,
} from "../src/utils/evidenceContext";
import type { EvidenceContext } from "../src/utils/evidenceContext";
import { momentumSelection } from "../src/utils/momentumData";
import { matrixSelection } from "../src/utils/matrixData";
import { prevalenceSelection } from "../src/utils/prevalenceData";
import { compositionSelection } from "../src/utils/compositionData";
import { relationshipSelection } from "../src/utils/relationshipsData";
import { heatmapSelection } from "../src/utils/heatmapData";
import type { MomentumMatrixData, TopicCategoryHeatmapData } from "../src/types/intelligence";

const week = {
  week_start: "2026-09-28",
  week_end_exclusive: "2026-10-05",
  effective_start: "2026-09-30T00:00:00Z",
  effective_end_exclusive: "2026-10-05T00:00:00Z",
  is_partial_week: true,
};
const matrix: MomentumMatrixData = {
  window_weeks: 2,
  interval: { date_from: "2026-09-01", date_to: "2026-10-08" },
  previous_window: { start: "2026-09-07T00:00:00Z", end_exclusive: "2026-09-21T00:00:00Z" },
  recent_window: { start: "2026-09-21T00:00:00Z", end_exclusive: "2026-10-05T00:00:00Z" },
  topics: [],
};
const context: EvidenceContext = {
  source: "relationships",
  topicIds: [1, 2],
  dateFrom: null,
  dateTo: null,
  categoryScope: "all",
};
const fromUrl = (url: string) => parseEvidenceContext(new URL(url, "http://test").searchParams);

describe("Evidence selection mapping", () => {
  it("uses effective partial-week UTC boundaries for count/index momentum and optional weekly composition", () => {
    const selection = momentumSelection(1, { ...week, paper_count: 2, index_value: null }, "index");
    const result = observationEvidence("momentum", selection);
    expect(result).toMatchObject({
      topicIds: [1],
      dateFrom: "2026-09-30",
      dateTo: "2026-10-04",
      partialWeek: true,
      metric: "index",
    });
    expect(validateEvidenceContext(result)).toBeNull();
    const composition = compositionSelection(
      1,
      { ...week, total_papers: 10, topics: [{ topic_id: 1, topic_papers: 2, prevalence_pct: 20 }] },
      true,
    )!;
    expect(observationEvidence("composition", composition)).toMatchObject({
      dateFrom: "2026-09-30",
      dateTo: "2026-10-04",
      metric: "prevalence_pct",
      partialWeek: true,
    });
  });
  it("keeps current and previous complete windows separate for Matrix and prevalence", () => {
    for (const window of ["previous", "recent"] as const) {
      const mapped = observationEvidence("matrix", matrixSelection(matrix, 1, window)!);
      const prevalence = observationEvidence("prevalence", prevalenceSelection(matrix, 1, window)!);
      expect(mapped.window).toBe(window);
      expect(mapped.dateFrom).toBe(window === "previous" ? "2026-09-07" : "2026-09-21");
      expect(mapped.dateTo).toBe(window === "previous" ? "2026-09-20" : "2026-10-04");
      expect(prevalence.dateFrom).toBe(mapped.dateFrom);
      expect(prevalence.dateTo).toBe(mapped.dateTo);
      expect(validateEvidenceContext(prevalence)).toBeNull();
    }
  });
  it("passes canonical topic intersections unchanged and reproduces heatmap category scopes", () => {
    const relation = relationshipSelection(
      { date_from: null, date_to: "2026-10-04", nodes: [], edges: [], min_shared_papers: 1 },
      { kind: "relationship", topicAId: 2, topicBId: 1 },
    );
    expect(evidenceFilters(observationEvidence("relationships", relation))).toMatchObject({
      topic_ids: [1, 2],
      date_from: undefined,
      date_to: "2026-10-04",
    });
    for (const scope of ["all", "primary"] as const) {
      const heatmap: TopicCategoryHeatmapData = {
        date_from: "2026-09-01",
        date_to: "2026-10-04",
        category_scope: scope,
        topics: [{ topic_id: 1, topic_name: "Vision", paper_count: 3 }],
        categories: [{ category_id: 3, category_code: "cs.CV", paper_count: 10 }],
        cells: [
          {
            topic_id: 1,
            category_id: 3,
            paper_count: 3,
            category_prevalence_pct: 30,
            topic_distribution_pct: 100,
          },
        ],
      };
      const result = observationEvidence(
        "heatmap",
        heatmapSelection(heatmap, { categoryKey: "3", topicKey: "1" }, "topic_distribution_pct")!,
      );
      expect(evidenceFilters(result)).toMatchObject({
        category: "cs.CV",
        category_scope: scope,
        topic_ids: [1],
      });
      expect(fromUrl(evidenceExplorerUrl(result)).context).toEqual(result);
    }
  });
  it("round-trips shareable context, comparison metadata and pagination without dropping filters", () => {
    const result = observationEvidence("prevalence", prevalenceSelection(matrix, 1, "previous")!);
    expect(fromUrl(evidenceExplorerUrl(result, 3))).toEqual({ context: result, page: 3 });
    expect(evidenceFilters(result, 3)).toMatchObject({ offset: 20, limit: 10 });
    expect(fromUrl(evidenceExplorerUrl(context)).context).toEqual(context);
  });
  it.each([
    "evidence=v2&source=relationships&topic_id=1",
    "evidence=v1&source=relationships&topic_id=1&topic_id=1",
    "evidence=v1&source=relationships&topic_id=1&topic_id=2&topic_id=3",
    "evidence=v1&source=relationships&topic_id=1&query=keywords",
    "evidence=v1&source=relationships&topic_id=1&sort=oldest",
    "evidence=v1&source=relationships&topic_id=1&date_to=2026-02-30",
    "evidence=v1&source=relationships&topic_id=1&page=-1",
    "evidence=v1&source=relationships&topic_id=1&page=1.2",
    "evidence=v1&source=relationships&topic_id=1&category_scope=primary",
    "evidence=v1&source=relationships&topic_id=1&window=recent",
    "evidence=v1&source=heatmap&topic_id=1",
    "evidence=v1&source=momentum&topic_id=1",
    "evidence=v1&source=relationships&topic_id=1&metric=index",
    "evidence=v1&source=matrix&topic_id=1&window=recent&window_weeks=2&date_from=2026-09-22&date_to=2026-10-05",
    "evidence=v1&source=relationships&topic_id=1&date_from=2026-09-01&date_from=2026-09-02",
  ])("rejects unsupported, incomplete or conflicting context: %s", (query) => {
    const result = parseEvidenceContext(new URLSearchParams(query));
    expect(result.error).toBeTruthy();
    expect(result.context).toBeUndefined();
  });
});
