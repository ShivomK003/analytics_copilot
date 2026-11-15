import { useId } from "react";
import type { ReactNode } from "react";

export function ExecutivePanel({
  title,
  description,
  action,
  className = "",
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section className={`executive-panel ${className}`} aria-labelledby={headingId}>
      <header className="executive-panel-heading">
        <div>
          <h2 id={headingId}>{title}</h2>
          <p>{description}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function ExecutiveLoading({ label }: { label: string }) {
  return (
    <div className="executive-loading" role="status">
      <span className="skeleton-line" />
      <span className="skeleton-line" />
      <p>{label}</p>
    </div>
  );
}
