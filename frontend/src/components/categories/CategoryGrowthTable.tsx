import { useState } from "react";
import type { CategoryGrowthItem } from "../../types/dashboard";

type CategoryGrowthTableProps = {
  data: CategoryGrowthItem[];
};

const numberFormatter = new Intl.NumberFormat("en-US");

const percentageFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatChange(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${numberFormatter.format(value)}`;
}

function formatGrowth(value: string | number | null) {
  if (value === null) return "N/A";

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return "N/A";

  const sign = numericValue > 0 ? "+" : "";

  return `${sign}${percentageFormatter.format(numericValue)}%`;
}

const cellStyle = {
  padding: "16px",
  borderBottom: "1px solid var(--color-border)",
  color: "var(--color-text-primary)",
  fontSize: 14,
};

function getStatusColor(status: CategoryGrowthItem["growth_status"]) {
  switch (status) {
    case "growing":
      return "#059669";
    case "declining":
      return "#dc2626";
    case "new":
      return "#2563eb";
    case "stable":
      return "var(--color-text-secondary)";
  }
}

export function CategoryGrowthTable({ data }: CategoryGrowthTableProps) {
  const [showAll, setShowAll] = useState(false);

  const sortedData = [...data].sort(
    (a, b) => b.absolute_growth - a.absolute_growth,
  );

  const visibleData = showAll ? sortedData : sortedData.slice(0, 10);

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          textAlign: "left",
        }}
      >
        <thead>
          <tr>
            {[
              "Category",
              "Previous 30 Days",
              "Current 30 Days",
              "Change",
              "Growth",
              "Status",
            ].map((heading) => (
              <th
                key={heading}
                scope="col"
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--color-border)",
                  color: "var(--color-text-muted)",
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {visibleData.map((category) => (
            <tr key={category.category_id}>
              <td style={cellStyle}>
                <strong>{category.category_code}</strong>
              </td>

              <td style={cellStyle}>
                {numberFormatter.format(category.previous_30_day_count)}
              </td>

              <td style={cellStyle}>
                {numberFormatter.format(category.current_30_day_count)}
              </td>

              <td style={cellStyle}>
                {formatChange(category.absolute_growth)}
              </td>

              <td style={cellStyle}>
                {formatGrowth(category.growth_percentage)}
              </td>

              <td style={cellStyle}>
                <span
                  style={{
                    fontWeight: 600,
                    textTransform: "capitalize",
                    color: getStatusColor(category.growth_status),
                  }}
                >
                  {category.growth_status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sortedData.length > 10 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 20,
            marginBottom: 10,
          }}
        >
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            aria-expanded={showAll}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-accent)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {showAll
              ? "Show Top 10"
              : `Show All ${sortedData.length} Categories`}
          </button>
        </div>
      )}

      <p className="chart-caption">
        Growth compares the latest 30-day period with the preceding 30 days.
        Categories are ranked by absolute increase in paper count.
      </p>
    </div>
  );
}