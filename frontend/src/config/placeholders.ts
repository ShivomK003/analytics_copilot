export type PlaceholderIcon =
  | "activity"
  | "topics"
  | "authors"
  | "categories"
  | "trend"
  | "spark"
  | "signals"
  | "papers";

export type PlaceholderCard = {
  title: string;
  detail: string;
  message?: string;
  icon: PlaceholderIcon;
  tone?: "accent" | "info" | "success" | "warning";
  layout?: "default" | "preview";
};

export type PlaceholderSection = {
  title: string;
  description: string;
  eyebrow?: string;
  cards: PlaceholderCard[];
  gridVariant?: "compact" | "standard" | "wide";
};

export type PlaceholderHero = {
  title: string;
  primaryMetric: string;
  secondaryMetric: string;
  growthLabel: string;
  chips: string[];
};

export type PlaceholderPageContent = {
  title: string;
  description: string;
  hero?: PlaceholderHero;
  sections: PlaceholderSection[];
};

export const placeholderPages: Record<string, PlaceholderPageContent> = {
  overview: {
    title: "Overview",
    description:
      "A clear read on publication volume, topic movement, and author momentum across the AI research landscape.",
    hero: {
      title: "AI Research Activity",
      primaryMetric: "1,464 papers tracked",
      secondaryMetric: "315 published this week",
      growthLabel: "+12% vs last week",
      chips: [
        "Tracking 6 AI domains",
        "Updated daily via pipeline",
        "Topics detected: 8",
      ],
    },
    sections: [
      {
        eyebrow: "Core metrics",
        title: "KPI Summary",
        description:
          "Headline indicators are staged and ready to switch from placeholders to live warehouse metrics.",
        gridVariant: "compact",
        cards: [
          {
            title: "Research volume",
            detail: "Live metrics will appear once backend data is connected.",
            icon: "activity",
            tone: "accent",
          },
          {
            title: "Topic breadth",
            detail: "Domain coverage will update automatically with the first live sync.",
            icon: "topics",
            tone: "info",
          },
          {
            title: "Author activity",
            detail: "Comparative researcher signals will appear once ranking endpoints are connected.",
            icon: "authors",
            tone: "success",
          },
          {
            title: "Category mix",
            detail: "Formal subject distribution will appear with the next data connection step.",
            icon: "categories",
            tone: "warning",
          },
        ],
      },
      {
        eyebrow: "Research flow",
        title: "Publication Activity",
        description:
          "Trend surfaces are prepared for interactive charts and narrative movement tracking.",
        gridVariant: "wide",
        cards: [
          {
            title: "Weekly publication trend",
            detail: "Interactive trends available soon.",
            message: "A live weekly chart will appear here once the analytics feed is connected.",
            icon: "trend",
            tone: "accent",
            layout: "preview",
          },
          {
            title: "Momentum context",
            detail: "Contextual annotations will appear alongside the first live trend release.",
            message: "Narrative movement summaries will sit beside the chart layer.",
            icon: "spark",
            tone: "info",
            layout: "preview",
          },
        ],
      },
      {
        eyebrow: "Signals",
        title: "Topic Intelligence",
        description:
          "Topic distribution and movement will shape the semantic layer of the dashboard.",
        cards: [
          {
            title: "Topic distribution",
            detail: "Live topic concentration will appear once backend metrics are connected.",
            icon: "topics",
            tone: "accent",
          },
          {
            title: "Topic momentum",
            detail: "Growth patterns will surface with the next intelligence layer.",
            icon: "trend",
            tone: "info",
          },
          {
            title: "Emerging signals",
            detail: "Curated trend callouts will appear with the first research signal release.",
            icon: "signals",
            tone: "success",
          },
        ],
      },
      {
        eyebrow: "Navigation preview",
        title: "Category and Author Preview",
        description:
          "Quick summaries will guide exploration into deeper category and author views.",
        cards: [
          {
            title: "Primary categories",
            detail: "Category highlights will appear with the next live dashboard connection.",
            icon: "categories",
            tone: "warning",
          },
          {
            title: "Top authors",
            detail: "Ranking previews will populate once author activity data is available.",
            icon: "authors",
            tone: "success",
          },
        ],
      },
      {
        eyebrow: "Discovery",
        title: "Latest Papers",
        description:
          "The discovery feed is ready for recent publications, metadata cues, and quick scanning.",
        cards: [
          {
            title: "Recent paper feed",
            detail: "Live paper cards will appear once the feed is connected.",
            message: "Fresh publications, abstracts, and labels will be staged in this panel.",
            icon: "papers",
            tone: "accent",
            layout: "preview",
          },
        ],
      },
    ],
  },
  trends: {
    title: "Trends",
    description:
      "Publication velocity and long-range growth views will turn this page into the operational trend center.",
    sections: [
      {
        eyebrow: "Readout",
        title: "Trend Summary",
        description: "Headline indicators are ready for the first live publication movement metrics.",
        gridVariant: "compact",
        cards: [
          {
            title: "Volume snapshot",
            detail: "A live trend snapshot will appear once the backend feed is connected.",
            icon: "activity",
            tone: "accent",
          },
          {
            title: "Growth direction",
            detail: "Directional momentum will appear with the first trend release.",
            icon: "trend",
            tone: "info",
          },
        ],
      },
      {
        eyebrow: "Visualization",
        title: "Publication Volume",
        description: "Daily, weekly, and monthly volume views will anchor the charting experience here.",
        gridVariant: "wide",
        cards: [
          {
            title: "Publication volume chart",
            detail: "Interactive trends available soon.",
            message: "This chart space is prepared for live publication cadence analysis.",
            icon: "trend",
            tone: "accent",
            layout: "preview",
          },
          {
            title: "Granularity controls",
            detail: "Time filters and comparison modes are coming in the next refinement step.",
            icon: "spark",
            tone: "info",
          },
        ],
      },
      {
        eyebrow: "Long-range view",
        title: "Cumulative Growth",
        description: "Long-horizon movement will show how research output compounds over time.",
        cards: [
          {
            title: "Cumulative growth view",
            detail: "Live cumulative totals will appear once historical metrics are connected.",
            icon: "activity",
            tone: "accent",
          },
          {
            title: "Growth interpretation",
            detail: "Narrative context will accompany the first live analytics release.",
            icon: "signals",
            tone: "success",
          },
        ],
      },
    ],
  },
  topics: {
    title: "Topics",
    description:
      "Semantic topic analysis will make this page the main entry point for research-intelligence themes.",
    sections: [
      {
        eyebrow: "Coverage",
        title: "Topic Distribution",
        description: "Distribution surfaces will show which themes dominate the research corpus.",
        cards: [
          {
            title: "Topic distribution",
            detail: "Interactive trends available soon.",
            icon: "topics",
            tone: "accent",
            layout: "preview",
          },
          {
            title: "Topic ranking",
            detail: "Priority topic lists will appear once live endpoint data is connected.",
            icon: "signals",
            tone: "info",
          },
        ],
      },
      {
        eyebrow: "Cadence",
        title: "Weekly Topic Activity",
        description: "Weekly cadence views will compare evolving topic attention over time.",
        gridVariant: "wide",
        cards: [
          {
            title: "Weekly topic activity",
            detail: "Live topic cadence will appear once backend metrics are connected.",
            icon: "trend",
            tone: "accent",
            layout: "preview",
          },
          {
            title: "Topic cadence comparisons",
            detail: "Comparative timeline views will appear with the next chart release.",
            icon: "spark",
            tone: "info",
          },
        ],
      },
      {
        eyebrow: "Momentum",
        title: "Topic Growth",
        description: "Growth surfaces will highlight emerging and accelerating research areas.",
        cards: [
          {
            title: "Topic growth",
            detail: "Interactive trends available soon.",
            icon: "trend",
            tone: "accent",
            layout: "preview",
          },
          {
            title: "Emerging topic commentary",
            detail: "Narrative insight callouts will appear with the first topic intelligence release.",
            icon: "signals",
            tone: "success",
          },
        ],
      },
    ],
  },
  categories: {
    title: "Categories",
    description:
      "Formal arXiv category analysis will connect broad research patterns with topic-level intelligence.",
    sections: [
      {
        eyebrow: "Composition",
        title: "Category Distribution",
        description: "High-level category composition will anchor the page once data is connected.",
        cards: [
          {
            title: "Category distribution",
            detail: "Interactive trends available soon.",
            icon: "categories",
            tone: "warning",
            layout: "preview",
          },
          {
            title: "Primary category summary",
            detail: "Category leaders will appear with the next live analytics connection.",
            icon: "activity",
            tone: "info",
          },
        ],
      },
      {
        eyebrow: "Cadence",
        title: "Weekly Category Activity",
        description: "Time-based category comparisons will show how formal subject areas shift over time.",
        gridVariant: "wide",
        cards: [
          {
            title: "Weekly category activity",
            detail: "Live category cadence will appear once backend metrics are connected.",
            icon: "trend",
            tone: "accent",
            layout: "preview",
          },
          {
            title: "Category movement analysis",
            detail: "Comparative time series will appear with the next chart release.",
            icon: "signals",
            tone: "info",
          },
        ],
      },
      {
        eyebrow: "Momentum",
        title: "Category Growth",
        description: "Growth tracking will spotlight rising subject areas once the data layer is active.",
        cards: [
          {
            title: "Category growth",
            detail: "Interactive trends available soon.",
            icon: "trend",
            tone: "warning",
            layout: "preview",
          },
          {
            title: "Primary versus all associations",
            detail: "Relationship detail will appear once the full category layer is connected.",
            icon: "spark",
            tone: "info",
          },
        ],
      },
      {
        eyebrow: "Cross-analysis",
        title: "Category x Topic Matrix",
        description: "Cross-analysis between formal categories and semantic topics will land here.",
        cards: [
          {
            title: "Matrix view",
            detail: "Heatmap exploration will appear in a future intelligence release.",
            icon: "topics",
            tone: "accent",
            layout: "preview",
          },
        ],
      },
    ],
  },
  authors: {
    title: "Authors",
    description:
      "Author activity and collaboration insights will connect publication trends with researcher specialization.",
    sections: [
      {
        eyebrow: "Readout",
        title: "Collaboration Statistics",
        description: "Headline collaboration and authorship indicators are staged for live metrics.",
        gridVariant: "compact",
        cards: [
          {
            title: "Collaboration snapshot",
            detail: "A live collaboration snapshot will appear once author metrics are connected.",
            icon: "authors",
            tone: "success",
          },
          {
            title: "Authorship spread",
            detail: "Coverage indicators will appear with the first author endpoint release.",
            icon: "activity",
            tone: "info",
          },
        ],
      },
      {
        eyebrow: "Movement",
        title: "Author Activity",
        description: "Rankings and activity trends will appear once live author data is available.",
        gridVariant: "wide",
        cards: [
          {
            title: "Author activity",
            detail: "Interactive trends available soon.",
            icon: "trend",
            tone: "accent",
            layout: "preview",
          },
          {
            title: "Top author rankings",
            detail: "Data-backed ranking views will appear with the next author release.",
            icon: "authors",
            tone: "success",
          },
        ],
      },
      {
        eyebrow: "Specialization",
        title: "Topic Specialization",
        description: "This section will show how authors concentrate across major topic areas.",
        cards: [
          {
            title: "Topic specialization",
            detail: "Interactive trends available soon.",
            icon: "topics",
            tone: "accent",
            layout: "preview",
          },
          {
            title: "Specialization commentary",
            detail: "Narrative interpretation will appear with the first specialization release.",
            icon: "signals",
            tone: "info",
          },
        ],
      },
    ],
  },
  papers: {
    title: "Papers",
    description:
      "The paper discovery experience is prepared for live feed content, search controls, and quick-read metadata.",
    sections: [
      {
        eyebrow: "Controls",
        title: "Paper Controls",
        description: "The control rail is ready for search, sort, and filtering once the data layer is connected.",
        cards: [
          {
            title: "Search and filters",
            detail: "Interactive controls available soon.",
            icon: "spark",
            tone: "accent",
          },
          {
            title: "Sort and density",
            detail: "View customization will appear with the first live discovery release.",
            icon: "activity",
            tone: "info",
          },
        ],
      },
      {
        eyebrow: "Feed",
        title: "Latest Paper Feed",
        description: "The feed layout is ready for live paper cards, labels, and metadata previews.",
        gridVariant: "wide",
        cards: [
          {
            title: "Latest paper feed",
            detail: "Live paper cards will appear once the discovery feed is connected.",
            message: "Recent papers, abstracts, and key tags will populate this view.",
            icon: "papers",
            tone: "accent",
            layout: "preview",
          },
          {
            title: "Abstract and badge preview",
            detail: "Metadata cues will appear with the first connected paper release.",
            icon: "signals",
            tone: "warning",
          },
        ],
      },
    ],
  },
};
