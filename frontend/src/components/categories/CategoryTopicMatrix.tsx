import { useMemo, useState } from "react";
import { Search, X, RotateCcw } from "lucide-react";

import { EmptyState } from "../feedback/EmptyState";
import type { CategoryTopicMatrixItem } from "../../types/dashboard";

type CategoryTopicMatrixProps = {
  data: CategoryTopicMatrixItem[];
};

const MAX_CATEGORIES = 10;

const numberFormatter = new Intl.NumberFormat("en-US");

export function CategoryTopicMatrix({ data }: CategoryTopicMatrixProps) {
  const [selectedCategories, setSelectedCategories] = useState<
    string[] | null
  >(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Transform API data into category-topic relationships.
  const { categories, topics, counts, maxCount } = useMemo(() => {
    const categoryTotals = new Map<string, number>();
    const topicTotals = new Map<string, number>();
    const cellCounts = new Map<string, number>();

    for (const item of data) {
      const count = item.shared_paper_count;

      categoryTotals.set(
        item.category_code,
        (categoryTotals.get(item.category_code) ?? 0) + count,
      );

      topicTotals.set(
        item.topic_name,
        (topicTotals.get(item.topic_name) ?? 0) + count,
      );

      const key = `${item.category_code}:${item.topic_name}`;

      cellCounts.set(
        key,
        (cellCounts.get(key) ?? 0) + count,
      );
    }

    const sortedCategories = [...categoryTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    const sortedTopics = [...topicTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    const maximum = Math.max(0, ...cellCounts.values());

    return {
      categories: sortedCategories,
      topics: sortedTopics,
      counts: cellCounts,
      maxCount: maximum,
    };
  }, [data]);

  // Default to the 10 categories with the highest total overlap.
  const defaultCategories = categories.slice(0, MAX_CATEGORIES);

  const visibleCategories =
    selectedCategories === null
      ? defaultCategories
      : selectedCategories;

  // Search only categories that are not already selected.
  const availableCategories = categories.filter(
    (category) =>
      !visibleCategories.includes(category) &&
      category
        .toLowerCase()
        .includes(searchQuery.trim().toLowerCase()),
  );

  function toggleCategory(category: string) {
    if (visibleCategories.includes(category)) {
      setSelectedCategories(
        visibleCategories.filter((item) => item !== category),
      );
      return;
    }

    if (visibleCategories.length >= MAX_CATEGORIES) {
      return;
    }

    setSelectedCategories([...visibleCategories, category]);
  }

  function resetCategories() {
    setSelectedCategories(null);
    setSearchQuery("");
    setSearchOpen(false);
  }

  function getCellCount(category: string, topic: string) {
    return counts.get(`${category}:${topic}`) ?? 0;
  }

function getCellStyle(count: number) {
  const intensity = maxCount > 0 ? count / maxCount : 0;

  return {
    backgroundColor:
        count === 0
            ? "var(--color-surface)"
            : `rgba(16, 163, 127, ${0.08 + intensity * 0.86})`,
    color:
      intensity > 0.5
        ? "#ffffff"
        : "var(--color-text-primary)",
    fontWeight: intensity > 0.3 ? 600 : 400,
  };
}

  if (data.length === 0) {
    return (
      <EmptyState
        title="No category-topic relationships available"
        description="Category-topic relationships will appear once categorized and topic-tagged papers are available."
      />
    );
  }

  return (
    <div>
      {/* Category selection controls */}
      <div style={{ marginBottom: 24 }}>
        {/* Selection count and reset button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: "var(--color-text-muted)",
            }}
          >
            Selected categories ({visibleCategories.length}/{MAX_CATEGORIES})
          </span>

          <button
            type="button"
            onClick={resetCategories}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 11px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Reset to Top 10
          </button>
        </div>

        {/* Selected category chips */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {visibleCategories.map((category) => (
            <button
              key={category}
              type="button"
              aria-label={`Remove ${category}`}
              onClick={() => toggleCategory(category)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 11px",
                borderRadius: 8,
                border: "1px solid #10A37F",
                background: "#10A37F",
                color: "#ffffff",
                cursor: "pointer",
              }}
            >
              {category}
              <X size={14} aria-hidden="true" />
            </button>
          ))}
        </div>

        {/* Searchable category selector */}
        <div
          style={{
            position: "relative",
            maxWidth: 380,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              background: "var(--color-surface)",
            }}
          >
            <Search
              size={17}
              color="var(--color-text-muted)"
              aria-hidden="true"
            />

            <input
              type="search"
              value={searchQuery}
              disabled={visibleCategories.length >= MAX_CATEGORIES}
              placeholder={
                visibleCategories.length >= MAX_CATEGORIES
                  ? "Remove a category to add another"
                  : "Search and add a category..."
              }
              aria-label="Search categories for heatmap"
              aria-expanded={
                searchOpen && visibleCategories.length < MAX_CATEGORIES
              }
              aria-controls="matrix-category-results"
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearchOpen(false);
                  event.currentTarget.blur();
                }
              }}
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--color-text-primary)",
                fontSize: 14,
              }}
            />
          </div>

          {/* Search results */}
          {searchOpen &&
            visibleCategories.length < MAX_CATEGORIES && (
              <div
                id="matrix-category-results"
                role="group"
                aria-label="Available categories"
                style={{
                  position: "absolute",
                  zIndex: 20,
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  maxHeight: 230,
                  overflowY: "auto",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  background: "var(--color-surface)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {availableCategories.length === 0 ? (
                  <p
                    style={{
                      padding: 12,
                      color: "var(--color-text-muted)",
                      fontSize: 13,
                    }}
                  >
                    No matching categories.
                  </p>
                ) : (
                  availableCategories.slice(0, 30).map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => {
                        toggleCategory(category);
                        setSearchQuery("");
                        setSearchOpen(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "10px 14px",
                        border: "none",
                        background: "transparent",
                        color: "var(--color-text-primary)",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      {category}
                    </button>
                  ))
                )}
              </div>
            )}
        </div>

        <p
          style={{
            marginTop: 10,
            color: "var(--color-text-muted)",
            fontSize: 12,
          }}
        >
          Compare up to {MAX_CATEGORIES} categories. Remove a selected
          category to make room for another.
        </p>
      </div>

      {/* Category-topic heatmap */}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 5,
            textAlign: "center",
          }}
        >
          <thead>
            <tr>
              <th
                scope="col"
                style={{
                  padding: "12px",
                  minWidth: 100,
                  textAlign: "left",
                  color: "var(--color-text-muted)",
                  fontSize: 12,
                  textTransform: "uppercase",
                }}
              >
                Category
              </th>

              {topics.map((topic) => (
                <th
                  key={topic}
                  scope="col"
                  style={{
                    padding: "12px 8px",
                    minWidth: 85,
                    color: "var(--color-text-muted)",
                    fontSize: 12,
                    textTransform: "uppercase",
                  }}
                >
                  {topic}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visibleCategories.length === 0 && (
              <tr>
                <td
                  colSpan={topics.length + 1}
                  style={{
                    padding: 32,
                    textAlign: "center",
                    color: "var(--color-text-muted)",
                  }}
                >
                  Select at least one category to display the heatmap.
                </td>
              </tr>
            )}

            {visibleCategories.map((category) => (
              <tr key={category}>
                <th
                  scope="row"
                  style={{
                    padding: "12px",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    color: "var(--color-text-primary)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {category}
                </th>

                {topics.map((topic) => {
                  const count = getCellCount(category, topic);

                  return (
                    <td
                      key={topic}
                      title={`${category} · ${topic}: ${numberFormatter.format(count)} papers`}
                      style={{
                        padding: "14px 10px",
                        borderRadius: 7,
                        minWidth: 85,
                        fontSize: 12,
                        cursor: "default",
                        ...getCellStyle(count),
                      }}
                    >
                      {numberFormatter.format(count)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="chart-caption">
        Each cell represents the number of papers associated with both the
        category and topic. Darker cells indicate higher counts. Papers may
        contribute to multiple categories and topics.
      </p>
    </div>
  );
}