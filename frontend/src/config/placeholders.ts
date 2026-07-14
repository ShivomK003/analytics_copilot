export type PlaceholderSection = {
  title: string;
  description: string;
  cards: Array<{
    title: string;
    detail: string;
  }>;
  gridVariant?: "compact" | "standard" | "wide";
};

export type PlaceholderPageContent = {
  title: string;
  description: string;
  sections: PlaceholderSection[];
};

export const placeholderPages: Record<string, PlaceholderPageContent> = {
  overview: {
    title: "Overview",
    description:
      "A high-level snapshot of research activity, ready for live metrics and cards in a later dashboard phase.",
    sections: [
      {
        title: "KPI Summary",
        description: "Summary cards will surface key totals once the dashboard connects to live backend data in Phase C.",
        gridVariant: "compact",
        cards: [
          { title: "Research volume", detail: "Live KPI card added in Phase C." },
          { title: "Topic breadth", detail: "Metric card reserved for later dashboard phases." },
          { title: "Author activity", detail: "Comparative summary appears after API integration." },
          { title: "Category mix", detail: "Warehouse-backed KPI added with real dashboard data." },
        ],
      },
      {
        title: "Publication Activity",
        description: "Time-series visualizations are intentionally held back until chart implementation begins.",
        gridVariant: "wide",
        cards: [
          { title: "Weekly publication trend", detail: "Chart added in a later dashboard phase." },
          { title: "Momentum context", detail: "Supporting annotations arrive with live analytics." },
        ],
      },
      {
        title: "Topic Intelligence",
        description: "Topic distribution and momentum will anchor the semantic overview experience.",
        cards: [
          { title: "Topic distribution", detail: "Live data connection added in Phase C." },
          { title: "Topic momentum", detail: "Growth patterns appear with the topic analytics phase." },
          { title: "Emerging signals", detail: "Placeholder surface for curated topic insights." },
        ],
      },
      {
        title: "Category and Author Preview",
        description: "Quick previews will guide users from overview into deeper category and author analysis.",
        cards: [
          { title: "Primary categories", detail: "Preview cards added after the overview data layer is wired." },
          { title: "Top authors", detail: "Ranking preview arrives with author endpoint integration." },
        ],
      },
      {
        title: "Latest Papers",
        description: "Paper previews stay structural-only until the papers experience is implemented.",
        cards: [
          { title: "Recent paper feed", detail: "Paper feed implemented in the Papers phase." },
        ],
      },
    ],
  },
  trends: {
    title: "Trends",
    description:
      "Publication velocity and growth views will live here once trend endpoints are connected and chart components are introduced.",
    sections: [
      {
        title: "Trend Summary",
        description: "Structural cards reserve space for the headline trend readout.",
        gridVariant: "compact",
        cards: [
          { title: "Volume snapshot", detail: "Summary metric added in a later dashboard phase." },
          { title: "Growth direction", detail: "Trend indicator appears with live backend data." },
        ],
      },
      {
        title: "Publication Volume",
        description: "This section is reserved for daily, weekly, and monthly publication volume analysis.",
        gridVariant: "wide",
        cards: [
          { title: "Publication volume chart", detail: "Chart added in a later dashboard phase." },
          { title: "Granularity controls", detail: "Interactive filters stay out of scope for Phase B." },
        ],
      },
      {
        title: "Cumulative Growth",
        description: "Long-horizon growth storytelling will be added once historical trend data is surfaced.",
        cards: [
          { title: "Cumulative growth view", detail: "Live data connection added in Phase C." },
          { title: "Growth interpretation", detail: "Narrative context appears with analytics content." },
        ],
      },
    ],
  },
  topics: {
    title: "Topics",
    description:
      "Semantic topic analysis will turn this page into the main entry point for research-intelligence themes.",
    sections: [
      {
        title: "Topic Distribution",
        description: "Distribution cards and charts will show which themes dominate the corpus.",
        cards: [
          { title: "Topic distribution", detail: "Chart added in a later dashboard phase." },
          { title: "Topic ranking", detail: "List view arrives with live endpoint integration." },
        ],
      },
      {
        title: "Weekly Topic Activity",
        description: "Weekly cadence views will help compare evolving topic attention over time.",
        gridVariant: "wide",
        cards: [
          { title: "Weekly topic activity", detail: "Live data connection added in Phase C." },
          { title: "Topic cadence comparisons", detail: "Comparative chart work is deferred." },
        ],
      },
      {
        title: "Topic Growth",
        description: "Growth surfaces will highlight emerging and accelerating research areas.",
        cards: [
          { title: "Topic growth", detail: "Chart added in a later dashboard phase." },
          { title: "Emerging topic commentary", detail: "Narrative insight layer comes later." },
        ],
      },
    ],
  },
  categories: {
    title: "Categories",
    description:
      "Formal arXiv category analysis will connect broad research patterns with topic-level intelligence in a later phase.",
    sections: [
      {
        title: "Category Distribution",
        description: "High-level category composition will anchor the page once data is wired in.",
        cards: [
          { title: "Category distribution", detail: "Chart added in a later dashboard phase." },
          { title: "Primary category summary", detail: "Overview card reserved for the category analytics phase." },
        ],
      },
      {
        title: "Weekly Category Activity",
        description: "Time-based category comparisons will show how formal subject areas shift over time.",
        gridVariant: "wide",
        cards: [
          { title: "Weekly category activity", detail: "Live data connection added in Phase C." },
          { title: "Category movement analysis", detail: "Comparative time series added later." },
        ],
      },
      {
        title: "Category Growth",
        description: "Growth tracking will spotlight rising subject areas once the data layer is active.",
        cards: [
          { title: "Category growth", detail: "Chart added in a later dashboard phase." },
          { title: "Primary versus all associations", detail: "Detailed distinctions arrive with real data." },
        ],
      },
      {
        title: "Category × Topic Matrix",
        description: "Cross-analysis between formal categories and semantic topics will land here.",
        cards: [
          { title: "Matrix view", detail: "Heatmap and matrix rendering are intentionally deferred." },
        ],
      },
    ],
  },
  authors: {
    title: "Authors",
    description:
      "Author-level activity and collaboration insights will connect publication trends with researcher specialization in a later phase.",
    sections: [
      {
        title: "Collaboration Statistics",
        description: "Structural space is reserved for headline collaboration and authorship metrics.",
        gridVariant: "compact",
        cards: [
          { title: "Collaboration snapshot", detail: "Summary metric added in a later dashboard phase." },
          { title: "Authorship spread", detail: "Live KPI card appears with author endpoint integration." },
        ],
      },
      {
        title: "Author Activity",
        description: "Rankings and activity trends will be added once real author data is available.",
        gridVariant: "wide",
        cards: [
          { title: "Author activity", detail: "Live data connection added in Phase C." },
          { title: "Top author rankings", detail: "Data-backed list view is intentionally deferred." },
        ],
      },
      {
        title: "Topic Specialization",
        description: "This section will show how authors concentrate across major topic areas.",
        cards: [
          { title: "Topic specialization", detail: "Chart added in a later dashboard phase." },
          { title: "Specialization commentary", detail: "Narrative interpretation appears later." },
        ],
      },
    ],
  },
  papers: {
    title: "Papers",
    description:
      "The paper discovery experience will land here once Phase C and later papers-specific work introduce real feed content.",
    sections: [
      {
        title: "Paper Controls",
        description: "Controls are represented structurally only. Interactive filtering and query state are out of scope for Phase B.",
        cards: [
          { title: "Search and filters", detail: "Interactive controls arrive in a later dashboard phase." },
          { title: "Sort and density", detail: "View customization is intentionally deferred." },
        ],
      },
      {
        title: "Latest Paper Feed",
        description: "The feed layout is ready for live paper cards once the backend integration phase begins.",
        gridVariant: "wide",
        cards: [
          { title: "Latest paper feed", detail: "Paper feed implemented in the Papers phase." },
          { title: "Abstract and badge preview", detail: "Live data connection added in Phase C." },
        ],
      },
    ],
  },
};
