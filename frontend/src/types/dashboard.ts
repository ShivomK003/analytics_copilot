export type DashboardKpis = {
  total_papers: number | null;
  papers_published_today: number | null;
  papers_published_this_week: number | null;
  papers_published_this_month: number | null;
  top_topic_id: number | null;
  top_topic_name: string | null;
  top_topic_paper_count: number | null;
  top_category_id: number | null;
  top_category_code: string | null;
  top_category_paper_count: number | null;
  top_author_id: number | null;
  top_author_name: string | null;
  top_author_paper_count: number | null;
  latest_etl_run_id: number | null;
  latest_etl_status: string | null;
  latest_etl_start_time: string | null;
  latest_etl_end_time: string | null;
  latest_etl_new_papers_loaded: number | null;
  latest_etl_duplicates_skipped: number | null;
  latest_etl_duration_seconds: number | null;
};

export type DailyTrendPoint = {
  publication_date: string;
  paper_count: number;
};

export type WeeklyTrendPoint = {
  week_start: string;
  paper_count: number;
};

export type MonthlyTrendPoint = {
  month_start: string;
  paper_count: number;
};

export type CumulativeTrendPoint = {
  publication_date: string;
  papers_published: number;
  cumulative_papers: number;
};

export type TrendChartPoint = {
  label: string;
  value: number;
};

export type TopicDistributionItem = {
  topic_id: number;
  topic_name: string;
  paper_count: number;
  percentage_of_tagged_papers: string | number | null;
};

export type TopicWeeklyItem = {
  week_start: string;
  topic_id: number;
  topic_name: string;
  paper_count: number;
};

export type TopicGrowthItem = {
  topic_id: number;
  topic_name: string;
  current_period_start: string;
  current_period_end: string;
  previous_period_start: string;
  previous_period_end: string;
  current_30_day_count: number;
  previous_30_day_count: number;
  absolute_growth: number;
  growth_percentage: string | number | null;
  growth_status: TopicGrowthStatus;
};

export type TopicGrowthStatus = "new" | "growing" | "declining" | "stable";

export type PrimaryCategoryDistributionItem = {
  category_code: string;
  paper_count: number;
  percentage_of_primary_categorized_papers: string | number | null;
};

export type CategoryGrowthStatus = "new" | "growing" | "declining" | "stable";

export type CategoryGrowthItem = {
  category_id: number;
  category_code: string;
  current_period_start: string;
  current_period_end: string;
  previous_period_start: string;
  previous_period_end: string;
  current_30_day_count: number;
  previous_30_day_count: number;
  absolute_growth: number;
  growth_percentage: string | number | null;
  growth_status: CategoryGrowthStatus;
};

export type CategoryDistributionItem = {
  category_id: number;
  category_code: string;
  paper_count: number;
  percentage_of_categorized_papers: string | number | null;
};

export type CategoryWeeklyItem = {
  week_start: string;
  category_id: number;
  category_code: string;
  paper_count: number;
};

export type CategoryTopicMatrixItem = {
  category_id: number;
  category_code: string;
  topic_id: number;
  topic_name: string;
  shared_paper_count: number;
};  

export type AuthorSearchItem = TopAuthorItem & {
  matching_topic_paper_count: number | null;
};

export type AuthorTopicItem = {
  author_id: number;
  author_name: string;
  topic_id: number;
  topic_name: string;
  paper_count: number;
};

export type AuthorPaperItem = {
  paper_id: string;
  title: string;
  abstract: string | null;
  primary_category: string | null;
  published_date: string | null;
  updated_date: string | null;
  arxiv_url: string | null;
  pdf_url: string | null;
  topics: string[];
};

export type AuthorSearchParams = {
  query?: string;
  topic?: string;
  limit?: number;
  offset?: number;
};

export type AuthorPapersParams = {
  authorId: number;
  topic?: string;
  limit?: number;
  offset?: number;
};

export type TopAuthorItem = {
  author_id: number;
  author_name: string;
  paper_count: number;
  latest_publication_date: string | null;
  distinct_topic_count: number;
  distinct_category_count: number;
};

export type AuthorStatistics = {
  average_authors_per_paper: number | null;
  median_authors_per_paper: number | null;
  maximum_authors_per_paper: number | null;
  single_author_papers: number | null;
  multi_author_papers: number | null;
};

export type LatestPaperItem = {
  paper_id: string;
  title: string;
  abstract: string | null;
  authors: string[];
  primary_category: string | null;
  categories: string[];
  topics: string[];
  published_date: string | null;
  updated_date: string | null;
  pdf_url: string | null;
  arxiv_url: string | null;
  author_count: number;
  category_count: number;
  topic_count: number;
};

export type DashboardHomeResponse = {
  kpis: DashboardKpis;
  daily_trend: DailyTrendPoint[];
  weekly_trend: WeeklyTrendPoint[];
  topic_distribution: TopicDistributionItem[];
  topic_growth: TopicGrowthItem[];
  primary_category_distribution: PrimaryCategoryDistributionItem[];
  category_growth: CategoryGrowthItem[];
  top_authors: TopAuthorItem[];
  author_statistics: AuthorStatistics;
  latest_papers: LatestPaperItem[];
};


export type PaperSearchParams = {
  query?: string;
  topic?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: "newest" | "oldest" | "relevance";
  limit?: number;
  offset?: number;
};

export type PaperSearchItem = {
  paper_id: string;
  title: string;
  abstract: string | null;
  primary_category: string | null;
  published_date: string | null;
  updated_date: string | null;
  arxiv_url: string | null;
  pdf_url: string | null;
  topics: string[];
};

export type PaperDetail = PaperSearchItem & {
  year: number | null;
  month: number | null;
  week: number | null;
  categories: string[];
};

export type PaperAuthor = {
  author_id: number;
  author_name: string;
};

export type RelatedPaper = {
  paper_id: string;
  title: string;
  abstract: string | null;
  primary_category: string | null;
  published_date: string | null;
  arxiv_url: string | null;
  pdf_url: string | null;
  shared_topic_count: number;
};