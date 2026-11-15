/** Contracts mirror backend/app/schemas/intelligence.py; dates are UTC ISO strings. */
export interface IntelligenceMetadata {
  date_from: string | null;
  date_to: string | null;
  timezone: "UTC";
  observed_date_from: string | null;
  observed_date_to: string | null;
  coverage_status: "unknown";
  warnings: string[];
}
export interface IntelligenceResponse<T> {
  meta: IntelligenceMetadata;
  data: T;
}
export interface CoverageData {
  total_indexed_papers: number;
  dated_papers: number;
  undated_papers: number;
  tagged_papers: number;
  untagged_papers: number;
  total_topics: number;
  observed_date_from: string | null;
  observed_date_to: string | null;
  latest_successful_etl_at: string | null;
}
export interface TopicOption {
  topic_id: number;
  topic_name: string;
  period_paper_count: number;
  total_indexed_paper_count: number;
}
export interface ReportingInterval {
  date_from: string | null;
  date_to: string | null;
}
export interface WeeklyBucket {
  week_start: string;
  week_end_exclusive: string;
  effective_start: string;
  effective_end_exclusive: string;
  is_partial_week: boolean;
}
export interface MomentumPoint extends WeeklyBucket {
  paper_count: number;
  index_value: number | null;
}
export interface MomentumTopic {
  topic_id: number;
  topic_name: string;
  baseline_week_start: string | null;
  baseline_count: number | null;
  points: MomentumPoint[];
}
export interface MomentumData {
  mode: "count" | "index";
  interval: ReportingInterval;
  topics: MomentumTopic[];
}
export interface ComparisonWindow {
  start: string;
  end_exclusive: string;
}
export interface MomentumMatrixTopic extends TopicOption {
  previous_paper_count: number;
  recent_paper_count: number;
  absolute_change: number;
  growth_percent: number | null;
  growth_state: "growing" | "declining" | "stable" | "no_baseline";
  low_baseline: boolean;
}
export interface MomentumMatrixData {
  window_weeks: number;
  interval: ReportingInterval;
  previous_window: ComparisonWindow | null;
  recent_window: ComparisonWindow | null;
  topics: MomentumMatrixTopic[];
}
export interface AssociationTopic {
  topic_id: number;
  topic_name: string;
  paper_count: number;
}
export interface RelationshipEdge {
  topic_a_id: number;
  topic_b_id: number;
  shared_paper_count: number;
  jaccard_similarity: number | null;
}
export interface RelationshipsData extends ReportingInterval {
  min_shared_papers: number;
  nodes: AssociationTopic[];
  edges: RelationshipEdge[];
}
export interface HeatmapCategory {
  category_id: number;
  category_code: string;
  paper_count: number;
}
export interface HeatmapCell {
  topic_id: number;
  category_id: number;
  paper_count: number;
  category_prevalence_pct: number | null;
  topic_distribution_pct: number | null;
}
export type CategoryScope = "all" | "primary";
export interface TopicCategoryHeatmapData extends ReportingInterval {
  category_scope: CategoryScope;
  topics: AssociationTopic[];
  categories: HeatmapCategory[];
  cells: HeatmapCell[];
}
export interface CompositionTopic {
  topic_id: number;
  topic_name: string;
}
export interface CompositionWeek extends WeeklyBucket {
  total_papers: number;
  topics: { topic_id: number; topic_papers: number; prevalence_pct: number | null }[];
}
export interface CompositionData {
  interval: ReportingInterval;
  topics: CompositionTopic[];
  weeks: CompositionWeek[];
}
export interface EvidenceRecord {
  paper_id: string;
  title: string;
  abstract: string | null;
  published_date: string;
  authors: string[];
  primary_category: string | null;
  arxiv_url: string | null;
  pdf_url: string | null;
}
export type EvidenceSort = "published_desc" | "published_asc" | "title_asc";
export interface EvidenceData {
  total: number;
  supporting_total?: number;
  limit: number;
  offset: number;
  has_more: boolean;
  records: EvidenceRecord[];
}
export interface DateFilters {
  date_from?: string;
  date_to?: string;
}
export interface TopicFilters extends DateFilters {
  topic_ids?: readonly number[];
}
export interface MomentumFilters extends TopicFilters {
  mode?: "count" | "index";
  include_partial_weeks?: boolean;
}
export interface MatrixFilters extends TopicFilters {
  window_weeks?: number;
}
export interface RelationshipFilters extends TopicFilters {
  min_shared_papers?: number;
}
export interface HeatmapFilters extends TopicFilters {
  category_scope?: CategoryScope;
}
export interface CompositionFilters extends TopicFilters {
  include_partial_weeks?: boolean;
}
export interface EvidenceFilters extends HeatmapFilters {
  q?: string;
  sort?: EvidenceSort;
  category?: string;
  limit?: number;
  offset?: number;
}
export interface IntelligenceDataMap {
  coverage: CoverageData;
  topics: TopicOption[];
  momentum: MomentumData;
  "momentum-matrix": MomentumMatrixData;
  relationships: RelationshipsData;
  "topic-category-heatmap": TopicCategoryHeatmapData;
  composition: CompositionData;
  evidence: EvidenceData;
}
export interface IntelligenceFilterMap {
  coverage: Record<string, never>;
  topics: DateFilters;
  momentum: MomentumFilters;
  "momentum-matrix": MatrixFilters;
  relationships: RelationshipFilters;
  "topic-category-heatmap": HeatmapFilters;
  composition: CompositionFilters;
  evidence: EvidenceFilters;
}
export type IntelligenceEndpoint = keyof IntelligenceDataMap;
