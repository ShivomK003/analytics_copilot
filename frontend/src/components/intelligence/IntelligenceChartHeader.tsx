import type { ReactNode } from "react";

export interface IntelligenceChartHeading {
  title: string;
  description: string;
}

export function IntelligenceChartHeader({
  heading,
  children,
}: {
  heading?: IntelligenceChartHeading;
  children: ReactNode;
}) {
  return (
    <header className="intelligence-chart-header executive-panel-heading">
      {heading ? (
        <div className="intelligence-chart-heading">
          <h2>{heading.title}</h2>
          <p>{heading.description}</p>
        </div>
      ) : null}
      <div className="intelligence-chart-controls">{children}</div>
    </header>
  );
}
