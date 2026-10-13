import type { TopicGrowthItem } from "../../types/dashboard";

type TopicGrowthTableProps = {
  data: TopicGrowthItem[];
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

export function TopicGrowthTable({ data }: TopicGrowthTableProps) {
  const sortedData = [...data].sort(
    (a, b) => b.absolute_growth - a.absolute_growth,
  );

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
              "Topic",
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
          {sortedData.map((topic) => (
            <tr key={topic.topic_id}>
              <td style={cellStyle}>
                <strong>{topic.topic_name}</strong>
              </td>

              <td style={cellStyle}>
                {numberFormatter.format(topic.previous_30_day_count)}
              </td>

              <td style={cellStyle}>
                {numberFormatter.format(topic.current_30_day_count)}
              </td>

              <td style={cellStyle}>
                {formatChange(topic.absolute_growth)}
              </td>

              <td style={cellStyle}>
                {formatGrowth(topic.growth_percentage)}
              </td>

              <td style={cellStyle}>
                <span
                  style={{
                    ...statusStyle,
                    color: getStatusColor(topic.growth_status),
                  }}
                >
                  {topic.growth_status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="chart-caption">
        Growth compares the latest 30-day period with the preceding 30 days.
        Topics are ranked by absolute increase in paper count.
      </p>
    </div>
  );
}

const cellStyle = {
  padding: "16px",
  borderBottom: "1px solid var(--color-border)",
  color: "var(--color-text-primary)",
  fontSize: 14,
};

const statusStyle = {
  fontWeight: 600,
  textTransform: "capitalize" as const,
};

function getStatusColor(status: TopicGrowthItem["growth_status"]) {
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