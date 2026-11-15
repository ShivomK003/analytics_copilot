import type { CategoryScope, EvidenceFilters, EvidenceSort } from "../types/intelligence";
import type { MomentumSelection } from "./momentumData";
import type { MatrixSelection } from "./matrixData";
import type { PrevalenceSelection } from "./prevalenceData";
import type { CompositionSelection } from "./compositionData";
import type { RelationshipSelection } from "./relationshipsData";
import type { HeatmapSelection } from "./heatmapData";

export type EvidenceSource =
  "momentum" | "matrix" | "prevalence" | "composition" | "relationships" | "heatmap";
export type EvidenceMetric =
  | "count"
  | "index"
  | "prevalence_pct"
  | "paper_count"
  | "category_prevalence_pct"
  | "topic_distribution_pct";
export interface EvidenceContext {
  source: EvidenceSource;
  topicIds: readonly number[];
  dateFrom: string | null;
  dateTo: string | null;
  category?: string;
  categoryScope: CategoryScope;
  window?: "recent" | "previous";
  windowWeeks?: number;
  partialWeek?: boolean;
  metric?: EvidenceMetric;
}
export interface EvidenceRefinement {
  q?: string;
  sort?: EvidenceSort;
}
export const evidenceSortOptions = [
  { value: "published_desc", label: "Newest first" },
  { value: "published_asc", label: "Oldest first" },
  { value: "title_asc", label: "Title A–Z" },
] as const;
export const evidencePageSize = 10;
const sources: EvidenceSource[] = [
  "momentum",
  "matrix",
  "prevalence",
  "composition",
  "relationships",
  "heatmap",
];
const dateIsValid = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

export function validateEvidenceContext(context: EvidenceContext): string | null {
  if (!sources.includes(context.source)) return "This evidence source is not supported.";
  if (
    context.topicIds.length < 1 ||
    context.topicIds.length > 2 ||
    new Set(context.topicIds).size !== context.topicIds.length ||
    context.topicIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    return "Select one topic, or two different topics for an intersection.";
  if (context.source !== "relationships" && context.topicIds.length !== 1)
    return "This observation requires exactly one topic.";
  if (!["all", "primary"].includes(context.categoryScope))
    return "This category scope is not supported.";
  if (
    (context.dateFrom !== null && !dateIsValid(context.dateFrom)) ||
    (context.dateTo !== null && !dateIsValid(context.dateTo)) ||
    (context.dateFrom && context.dateTo && context.dateFrom > context.dateTo)
  )
    return "The evidence publication interval is invalid.";
  if (
    ["momentum", "matrix", "prevalence", "composition"].includes(context.source) &&
    (!context.dateFrom || !context.dateTo)
  )
    return "This observation requires a bounded publication interval.";
  if (context.source === "heatmap" && !context.category?.trim())
    return "A heatmap selection requires a category.";
  if (context.source !== "heatmap" && context.category !== undefined)
    return "A category constraint is supported only for heatmap observations.";
  if (
    ["matrix", "prevalence"].includes(context.source) &&
    (!context.window ||
      !Number.isInteger(context.windowWeeks) ||
      context.windowWeeks! < 2 ||
      context.windowWeeks! > 12)
  )
    return "A comparison needs an explicit current or previous 2–12-week window.";
  if (
    !["matrix", "prevalence"].includes(context.source) &&
    (context.window !== undefined || context.windowWeeks !== undefined)
  )
    return "Comparison constraints are unsupported for this observation.";
  if (!["momentum", "composition"].includes(context.source) && context.partialWeek !== undefined)
    return "Partial-week context is unsupported for this observation.";
  if (context.source !== "heatmap" && context.categoryScope !== "all")
    return "Category scope applies only to heatmap observations.";
  if (context.window && !["recent", "previous"].includes(context.window))
    return "The comparison window is unsupported.";
  const allowedMetrics: Partial<Record<EvidenceSource, EvidenceMetric[]>> = {
    momentum: ["count", "index"],
    prevalence: ["prevalence_pct"],
    composition: ["prevalence_pct"],
    heatmap: ["paper_count", "category_prevalence_pct", "topic_distribution_pct"],
  };
  if (context.metric !== undefined && !allowedMetrics[context.source]?.includes(context.metric))
    return "The chart metric is unsupported for this evidence source.";
  if (context.source === "matrix" || context.source === "prevalence") {
    const start = new Date(context.dateFrom!);
    const duration = Date.parse(context.dateTo!) - start.getTime() + 86400000;
    if (start.getUTCDay() !== 1 || duration !== context.windowWeeks! * 7 * 86400000)
      return "Comparison evidence must contain the selected number of complete Monday-based UTC weeks.";
  }
  return null;
}

export function evidenceFilters(
  context: EvidenceContext,
  page = 1,
  refinement: EvidenceRefinement = {},
): EvidenceFilters {
  return {
    topic_ids: context.topicIds,
    date_from: context.dateFrom ?? undefined,
    date_to: context.dateTo ?? undefined,
    category: context.category,
    category_scope: context.categoryScope,
    limit: evidencePageSize,
    offset: (page - 1) * evidencePageSize,
    ...(refinement.q?.trim() ? { q: refinement.q.trim() } : {}),
    ...(refinement.sort && refinement.sort !== "published_desc" ? { sort: refinement.sort } : {}),
  };
}
export function observationEvidence(
  source: "momentum",
  selection: MomentumSelection,
): EvidenceContext;
export function observationEvidence(source: "matrix", selection: MatrixSelection): EvidenceContext;
export function observationEvidence(
  source: "prevalence",
  selection: PrevalenceSelection,
): EvidenceContext;
export function observationEvidence(
  source: "composition",
  selection: CompositionSelection,
): EvidenceContext;
export function observationEvidence(
  source: "relationships",
  selection: RelationshipSelection,
): EvidenceContext;
export function observationEvidence(
  source: "heatmap",
  selection: HeatmapSelection,
): EvidenceContext;
export function observationEvidence(
  source: EvidenceSource,
  selection:
    | MomentumSelection
    | MatrixSelection
    | PrevalenceSelection
    | CompositionSelection
    | RelationshipSelection
    | HeatmapSelection,
): EvidenceContext {
  return {
    source,
    ...("metric" in selection
      ? { metric: selection.metric }
      : "mode" in selection
        ? { metric: selection.mode }
        : {}),
    topicIds: "topicIds" in selection ? selection.topicIds : [selection.topicId],
    dateFrom: selection.dateFrom,
    dateTo: selection.dateTo,
    categoryScope: "categoryScope" in selection ? selection.categoryScope : "all",
    ...("category" in selection ? { category: selection.category } : {}),
    ...("window" in selection
      ? { window: selection.window, windowWeeks: selection.windowWeeks }
      : {}),
    ...("isPartialWeek" in selection ? { partialWeek: selection.isPartialWeek } : {}),
    ...(source === "momentum" && "effectiveStart" in selection
      ? {
          partialWeek:
            selection.effectiveStart.slice(0, 10) !== (selection as MomentumSelection).weekStart ||
            Date.parse(selection.effectiveEndExclusive) - Date.parse(selection.effectiveStart) !==
              7 * 86400000,
        }
      : {}),
  };
}
export function evidenceExplorerUrl(
  context: EvidenceContext,
  page = 1,
  refinement: EvidenceRefinement = {},
): string {
  const params = new URLSearchParams({
    evidence: "v1",
    source: context.source,
    category_scope: context.categoryScope,
  });
  context.topicIds.forEach((id) => params.append("topic_id", String(id)));
  if (context.dateFrom) params.set("date_from", context.dateFrom);
  if (context.dateTo) params.set("date_to", context.dateTo);
  if (context.category) params.set("category", context.category);
  if (context.window) params.set("window", context.window);
  if (context.windowWeeks !== undefined) params.set("window_weeks", String(context.windowWeeks));
  if (context.partialWeek !== undefined) params.set("partial_week", String(context.partialWeek));
  if (context.metric) params.set("metric", context.metric);
  if (refinement.q?.trim()) params.set("q", refinement.q.trim());
  if (refinement.sort && refinement.sort !== "published_desc") params.set("sort", refinement.sort);
  if (page !== 1) params.set("page", String(page));
  return `/papers?${params}`;
}
export function parseEvidenceContext(params: URLSearchParams): {
  context?: EvidenceContext;
  page: number;
  error?: string;
  refinement?: EvidenceRefinement;
} {
  const page = Number(params.get("page") ?? "1");
  const supported = new Set([
    "evidence",
    "source",
    "topic_id",
    "date_from",
    "date_to",
    "category",
    "category_scope",
    "window",
    "window_weeks",
    "partial_week",
    "page",
    "metric",
    "q",
    "sort",
  ]);
  if (params.get("evidence") !== "v1")
    return {
      page: 1,
      error:
        "This evidence link version is unsupported. Clear the imported context to browse independently.",
    };
  if ([...params.keys()].some((key) => !supported.has(key)))
    return {
      page: 1,
      error:
        "This evidence link includes unsupported filters. Its analytical constraints have not been broadened.",
    };
  for (const key of supported) {
    if (key !== "topic_id" && params.getAll(key).length > 1)
      return { page: 1, error: "Duplicate evidence parameters are not supported." };
  }
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger((page - 1) * evidencePageSize)
  )
    return { page: 1, error: "The evidence page number is invalid." };
  const q = (params.get("q") ?? "").trim();
  const sort = params.get("sort") ?? "published_desc";
  if (q.length > 200) return { page, error: "Search keywords must not exceed 200 characters." };
  if (!evidenceSortOptions.some((option) => option.value === sort))
    return { page, error: "This evidence sort order is unsupported." };
  const refinement: EvidenceRefinement = {
    ...(q ? { q } : {}),
    ...(sort !== "published_desc" ? { sort: sort as EvidenceSort } : {}),
  };
  const context: EvidenceContext = {
    source: params.get("source") as EvidenceSource,
    ...(params.has("metric") ? { metric: params.get("metric") as EvidenceMetric } : {}),
    topicIds: params.getAll("topic_id").map(Number),
    dateFrom: params.get("date_from"),
    dateTo: params.get("date_to"),
    categoryScope: (params.get("category_scope") ?? "all") as CategoryScope,
    ...(params.has("category") ? { category: params.get("category")! } : {}),
    ...(params.has("window") ? { window: params.get("window") as EvidenceContext["window"] } : {}),
    ...(params.has("window_weeks") ? { windowWeeks: Number(params.get("window_weeks")) } : {}),
    ...(params.has("partial_week") ? { partialWeek: params.get("partial_week") === "true" } : {}),
  };
  if (params.has("partial_week") && !["true", "false"].includes(params.get("partial_week")!))
    return { page, error: "The partial-week context is invalid." };
  const error = validateEvidenceContext(context);
  return error
    ? { page, error }
    : { context, page, ...(Object.keys(refinement).length ? { refinement } : {}) };
}
